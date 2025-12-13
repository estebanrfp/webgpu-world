/**
 * NPC System - Multiple avatars with AI behavior and independent animations
 * Each NPC has its own AnimationSystem instance for autonomous behavior
 */

import { 
  CONFIG, 
  AnimationSystem,
  NPC_AVATAR_URLS,
  loadGLB,
  loadTextureFromGLB,
  extractMeshData,
  extractSkinningData,
  createCharacterBuffers
} from '../index.js';

// NPC names and colors for HUD (future use)
const NPC_NAMES = ['Guard', 'Explorer', 'Traveler', 'Merchant', 'Archer', 'Mage', 'Warrior', 'Hunter', 'Druid', 'Bard'];
const NPC_COLORS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a855f7', '#3b82f6', '#10b981', '#f97316', '#ec4899', '#84cc16', '#06b6d4'];


/**
 * Creates the NPC system for managing multiple AI-controlled characters
 * @param {GPUDevice} device - WebGPU device
 * @param {Object} options - Configuration options
 * @returns {Object} NPC system with state and methods
 */
export function createNPCSystem(device, options = {}) {
  const {
    characterSystem = null,
    npcCount = 50,
    terrainSize = CONFIG.geometry.terrain.size,
    freezeRadius = 6,         // If player gets this close, NPCs stop (do NOT follow)
    wanderRadius = 50,        // Larger wander area for free roaming
    minSeparation = 3,
    baseSpeed = 8,            // Base walking speed
    runSpeed = 16,            // Running speed
    flySpeed = 25,            // Flying speed
    flyHeight = 15,           // Height to fly at
  } = options;

  // NPCs array
  const npcs = [];

  // Shared animation pools (memory optimization)
  let sharedAnimations = null;

  // Loading state
  let isLoading = false;
  let isLoaded = false;
  let hasSpawnedNearPlayer = false;  // Flag to spawn near player on first update

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function hexToRgb01(hex) {
    const normalized = String(hex || '').trim();
    if (!normalized.startsWith('#') || (normalized.length !== 7)) return [1, 1, 1];
    const r = parseInt(normalized.slice(1, 3), 16) / 255;
    const g = parseInt(normalized.slice(3, 5), 16) / 255;
    const b = parseInt(normalized.slice(5, 7), 16) / 255;
    return [r, g, b];
  }

  /**
   * Initialize all NPCs
   */
  async function init() {
    if (isLoading || isLoaded) return;
    isLoading = true;

    console.log(`🎮 Initializing NPC System (${npcCount} NPCs)...`);

    if (!characterSystem) {
      console.error('❌ NPC System requires `characterSystem` (to reuse avatar resources and animations).');
      isLoading = false;
      return;
    }

    // Wait for the player avatar to finish loading so NPCs can reuse the same buffers/texture/sampler
    const timeoutMs = 30_000;
    const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    console.log('⏳ Waiting for characterSystem to load avatar...');
    
    while (true) {
      const checks = {
        avatarLoaded: characterSystem.avatarLoaded,
        avatarVB: !!characterSystem.avatarVB,
        avatarIB: !!characterSystem.avatarIB,
        avatarIndexCount: characterSystem.avatarIndexCount,
        avatarTexture: !!characterSystem.avatarTexture,
        avatarSampler: !!characterSystem.avatarSampler,
        boneMatricesBuffer: !!characterSystem.boneMatricesBuffer,
        skeleton: !!characterSystem.skeleton,
        animations: !!characterSystem.animations
      };
      
      const avatarReady = Object.values(checks).every(v => v);
      if (avatarReady) {
        console.log('✅ characterSystem avatar ready:', checks);
        break;
      }

      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now - start > timeoutMs) {
        console.error('❌ NPC System timed out waiting for avatar resources. Status:', checks);
        isLoading = false;
        return;
      }
      await sleep(50);
    }

    // Get skeleton and animations for creating shared animation systems
    const skeleton = characterSystem.skeleton;
    const animations = characterSystem.animations;
    const MAX_BONES = characterSystem.MAX_BONES;

    // Create SHARED animation systems (memory optimization)
    // Instead of 50 AnimationSystems, we only create 4 (one per animation type)
    sharedAnimations = {
      Idle: { system: new AnimationSystem(skeleton, animations), buffer: null },
      Walk: { system: new AnimationSystem(skeleton, animations), buffer: null },
      Run: { system: new AnimationSystem(skeleton, animations), buffer: null },
      Fly: { system: new AnimationSystem(skeleton, animations), buffer: null },
    };
    
    // Create shared bone matrices buffers
    for (const [name, anim] of Object.entries(sharedAnimations)) {
      anim.buffer = device.createBuffer({
        size: MAX_BONES * 16 * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      
      // Play animation (fallback to Run if Fly/etc missing)
      if (animations[name]) {
        anim.system.play(name);
      } else if (name === 'Fly') {
        // Fallback for flying if no specific animation
        if (animations['Jump']) anim.system.play('Jump');
        else if (animations['Run']) anim.system.play('Run');
        else anim.system.play('Idle');
      } else {
        // Fallback for others
        anim.system.play('Idle');
      }
    }

    // Load extra NPC avatars for variety
    const avatarTemplates = [];
    
    // Add default player avatar as the first template
    avatarTemplates.push({
      vertexBuffer: characterSystem.avatarVB,
      indexBuffer: characterSystem.avatarIB,
      indexCount: characterSystem.avatarIndexCount,
      texture: characterSystem.avatarTexture,
      sampler: characterSystem.avatarSampler,
    });

    if (NPC_AVATAR_URLS && NPC_AVATAR_URLS.length > 0) {
      console.log(`⏳ Loading ${NPC_AVATAR_URLS.length} extra NPC avatars...`);
      
      for (let i = 0; i < NPC_AVATAR_URLS.length; i++) {
        const url = NPC_AVATAR_URLS[i];
        try {
          console.log(`   Loading NPC avatar ${i+1}/${NPC_AVATAR_URLS.length}: ${url.substring(0, 60)}...`);
          const glb = await loadGLB(url);
          const meshData = extractMeshData(glb.json, glb.bin);
          const skinningData = extractSkinningData(glb.json, glb.bin);
          
          // Create buffers
          const buffers = createCharacterBuffers(meshData, skinningData);
          
          const vb = device.createBuffer({
            size: buffers.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          });
          device.queue.writeBuffer(vb, 0, buffers.vertices);

          const ib = device.createBuffer({
            size: buffers.indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
          });
          device.queue.writeBuffer(ib, 0, buffers.indices);
          
          // Load texture
          let texture = null;
          const textureIndices = new Set();
          for (const mesh of meshData) {
            if (mesh.baseColorTextureIndex !== null) {
              textureIndices.add(mesh.baseColorTextureIndex);
            }
          }
          
          for (const texIdx of textureIndices) {
            const tex = await loadTextureFromGLB(glb.json, glb.bin, texIdx, device);
            if (tex) {
              texture = tex;
              break;
            }
          }
          
          if (texture) {
            avatarTemplates.push({
              vertexBuffer: vb,
              indexBuffer: ib,
              indexCount: buffers.indices.length / 4, // Assuming Uint32Array (4 bytes per index) -> wait, createCharacterBuffers returns Uint32Array in .indices
              // Actually createCharacterBuffers returns { vertices: Float32Array, indices: Uint32Array }
              // .indices.length is the count of indices
              // But wait, createCharacterBuffers returns typed arrays.
              // Let's check createCharacterBuffers implementation or usage in character.js
              // In character.js: 
              // avatarIB = device.createBuffer({ size: buffers.indices.byteLength ... })
              // avatarIndexCount = buffers.indices.length;
              // So yes, .length is correct for count.
              indexCount: buffers.indices.length,
              texture: texture,
              sampler: characterSystem.avatarSampler, // Reuse sampler
            });
            console.log(`   ✅ Loaded NPC avatar ${i+1}`);
          } else {
            console.warn(`   ⚠️ Failed to load texture for NPC avatar ${i+1}`);
          }
        } catch (e) {
          console.error(`   ❌ Failed to load NPC avatar ${i+1}:`, e);
        }
      }
    }

    console.log(`📍 Creating ${npcCount} NPCs with shared animation pools and ${avatarTemplates.length} avatar variations:`);
    console.log(`   - avatarVB: ${characterSystem.avatarVB ? 'OK' : 'MISSING'}`);
    console.log(`   - avatarIB: ${characterSystem.avatarIB ? 'OK' : 'MISSING'}`);
    console.log(`   - indexCount: ${characterSystem.avatarIndexCount}`);
    console.log(`   - texture: ${characterSystem.avatarTexture ? 'OK' : 'MISSING'}`);
    console.log(`   - sampler: ${characterSystem.avatarSampler ? 'OK' : 'MISSING'}`);
    console.log(`   - skeleton bones: ${skeleton ? skeleton.jointCount : 'N/A'}`);
    console.log(`   - animations: ${animations ? Object.keys(animations).length : 'N/A'}`);
    console.log('✅ Using 4 shared animation pools (Idle, Walk, Run, Fly) - memory optimized!');
    
    for (let index = 0; index < npcCount; index++) {
      const angle = (index / npcCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const radius = 5 + Math.random() * 30;  // Closer: 5-35 units from player
      const homeX = Math.cos(angle) * radius;
      const homeZ = Math.sin(angle) * radius;
      // Use white color (no tint) to preserve original avatar textures
      const [cr, cg, cb] = [1, 1, 1];

      // Pick a random avatar template
      const template = avatarTemplates[Math.floor(Math.random() * avatarTemplates.length)];

      // Determine initial animation based on state
      const isFlyer = Math.random() < 0.2; // 20% chance to be a flyer
      let initialState = Math.random() < 0.7 ? 'walking' : (Math.random() < 0.5 ? 'running' : 'idle');
      
      if (isFlyer && Math.random() < 0.5) {
        initialState = 'flying';
      }

      let initialAnim = 'Idle';
      if (initialState === 'running') initialAnim = 'Run';
      else if (initialState === 'walking') initialAnim = 'Walk';
      else if (initialState === 'flying') initialAnim = 'Fly';

      const npc = {
        id: index,
        name: NPC_NAMES[index % NPC_NAMES.length],
        color: '#ffffff',
        colorRgb: [cr, cg, cb],

        // Shared GPU resources (from template)
        vertexBuffer: template.vertexBuffer,
        indexBuffer: template.indexBuffer,
        indexCount: template.indexCount,
        texture: template.texture,
        sampler: template.sampler,
        // Reference to shared animation pool (assigned dynamically based on state)
        currentAnimation: initialAnim,

        // Position & movement - start very close to origin
        x: homeX,
        y: 0,
        z: homeZ,
        rotation: Math.random() * Math.PI * 2,
        homeX,
        homeZ,
        targetX: homeX,
        targetZ: homeZ,

        // State - start walking immediately with random target
        state: initialState,
        waitTime: 0,  // No initial wait
        isRunner: Math.random() < 0.6,  // 60% chance to be a runner (increased from 30%)
        isFlyer: isFlyer,
        walkSpeed: baseSpeed * (0.8 + Math.random() * 0.4),  // Varied walk speeds
        runSpeedMultiplier: 1.5 + Math.random() * 0.5,  // Varied run speeds
        flySpeedMultiplier: 1.2 + Math.random() * 0.4,  // Varied fly speeds

        // Player interaction
        isFrozen: false,

        // Bind group (created lazily) - will be recreated when animation changes
        bindGroup: null,
        shadowBindGroup: null,
        uniformBuffer: null,
        lastAnimationForBindGroup: null,  // Track which animation the bind group was created for
      };
      
      npcs.push(npc);
    }
    
    console.log(`✅ Created ${npcs.length} NPCs`);

    isLoaded = true;
    isLoading = false;
    console.log(`✅ NPC System initialized: ${npcs.length} NPCs loaded`);
  }

  /**
   * Check if a position is safe (not in water)
   */
  function isPositionSafe(x, z, getTerrainHeight) {
    if (!getTerrainHeight) return true;
    const waterLevel = CONFIG.world.waterLevel;
    const height = getTerrainHeight(x, z);
    return height >= waterLevel - 1.0;  // Safe if above water level
  }

  /**
   * Find a safe target position (not in water)
   */
  function findSafeTarget(fromX, fromZ, preferredX, preferredZ, getTerrainHeight) {
    // First check if preferred target is safe
    if (isPositionSafe(preferredX, preferredZ, getTerrainHeight)) {
      return { x: preferredX, z: preferredZ };
    }
    
    // Try to find a safe position by checking in a spiral pattern
    for (let radius = 10; radius <= 50; radius += 10) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const testX = fromX + Math.cos(angle) * radius;
        const testZ = fromZ + Math.sin(angle) * radius;
        if (isPositionSafe(testX, testZ, getTerrainHeight)) {
          return { x: testX, z: testZ };
        }
      }
    }
    
    // Fallback to current position
    return { x: fromX, z: fromZ };
  }

  /**
   * Move NPC towards target with collision avoidance
   * Avoids water areas completely
   */
  function moveTowards(npc, targetX, targetZ, speed, dt, playerX, playerZ, getTerrainHeight) {
    const waterLevel = CONFIG.world.waterLevel;
    const dx = targetX - npc.x;
    const dz = targetZ - npc.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.5) {
      let moveX = (dx / dist) * speed * dt;
      let moveZ = (dz / dist) * speed * dt;

      let newX = npc.x + moveX;
      let newZ = npc.z + moveZ;

      // Check if new position would be in water
      if (getTerrainHeight) {
        const newTerrainHeight = getTerrainHeight(newX, newZ);
        if (newTerrainHeight < waterLevel - 1.0) {
          // Try to find an alternate path around water
          // Check perpendicular directions
          const perpX1 = npc.x + dz / dist * speed * dt;
          const perpZ1 = npc.z - dx / dist * speed * dt;
          const perpX2 = npc.x - dz / dist * speed * dt;
          const perpZ2 = npc.z + dx / dist * speed * dt;
          
          const h1 = getTerrainHeight(perpX1, perpZ1);
          const h2 = getTerrainHeight(perpX2, perpZ2);
          
          if (h1 >= waterLevel - 1.0 && h1 > h2) {
            newX = perpX1;
            newZ = perpZ1;
          } else if (h2 >= waterLevel - 1.0) {
            newX = perpX2;
            newZ = perpZ2;
          } else {
            // Can't find safe path, stay in place
            return;
          }
        }
      }

      // Separation from other NPCs
      for (const other of npcs) {
        if (other === npc) continue;
        const odx = newX - other.x;
        const odz = newZ - other.z;
        const otherDist = Math.sqrt(odx * odx + odz * odz);

        if (otherDist < minSeparation && otherDist > 0) {
          const pushForce = (minSeparation - otherDist) / otherDist * 0.5;
          newX += odx * pushForce;
          newZ += odz * pushForce;
        }
      }

      // Separation from player
      const playerDx = newX - playerX;
      const playerDz = newZ - playerZ;
      const playerDist = Math.sqrt(playerDx * playerDx + playerDz * playerDz);
      if (playerDist < minSeparation && playerDist > 0) {
        const pushForce = (minSeparation - playerDist) / playerDist * 0.3;
        newX += playerDx * pushForce;
        newZ += playerDz * pushForce;
      }

      // Final water check after all adjustments
      if (getTerrainHeight) {
        const finalHeight = getTerrainHeight(newX, newZ);
        if (finalHeight < waterLevel - 1.0) {
          // Don't move into water
          return;
        }
      }

      // Clamp to terrain bounds
      const halfSize = terrainSize / 2 - 10;
      newX = Math.max(-halfSize, Math.min(halfSize, newX));
      newZ = Math.max(-halfSize, Math.min(halfSize, newZ));

      npc.x = newX;
      npc.z = newZ;

      // Rotate towards movement direction (same convention as player: atan2(x, z))
      const targetRotation = Math.atan2(moveX, moveZ);
      let rotDiff = targetRotation - npc.rotation;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      
      // Fast rotation - NPCs turn quickly to face their movement direction
      npc.rotation += rotDiff * 12 * dt;
    }
  }

  /**
   * Update all NPCs
   */
  function update(dt, playerX, playerY, playerZ, getTerrainHeight) {
    if (!isLoaded) return;

    // Teleport NPCs to the zone around the player on first update
    if (!hasSpawnedNearPlayer) {
      hasSpawnedNearPlayer = true;
      console.log(`📍 Spawning ${npcs.length} NPCs in the zone around player at (${playerX.toFixed(1)}, ${playerZ.toFixed(1)})...`);
      
      for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];
        const angle = (i / npcs.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const radius = 30 + Math.random() * 170;  // Much more spread: 30-200 units from player
        
        npc.x = playerX + Math.cos(angle) * radius;
        npc.z = playerZ + Math.sin(angle) * radius;
        npc.homeX = npc.x;
        npc.homeZ = npc.z;
        
        // Give each NPC an immediate random target to start moving
        const targetAngle = Math.random() * Math.PI * 2;
        const targetRadius = 15 + Math.random() * 30;
        npc.targetX = npc.x + Math.cos(targetAngle) * targetRadius;
        npc.targetZ = npc.z + Math.sin(targetAngle) * targetRadius;
        
        // Set Y to terrain height
        if (getTerrainHeight) {
          npc.y = getTerrainHeight(npc.x, npc.z);
        }
        
        console.log(`  NPC ${i}: spawned at (${npc.x.toFixed(1)}, ${npc.z.toFixed(1)}) → target (${npc.targetX.toFixed(1)}, ${npc.targetZ.toFixed(1)})`);
      }
    }

    for (const npc of npcs) {
      const dx = playerX - npc.x;
      const dz = playerZ - npc.z;
      const distToPlayer = Math.sqrt(dx * dx + dz * dz);

      // If player gets close, NPC stops moving (no following)
      npc.isFrozen = distToPlayer < freezeRadius;

      if (npc.isFrozen) {
        // Optional: face the player while frozen
        const angleToPlayer = Math.atan2(dx, dz);
        let rotDiff = angleToPlayer - npc.rotation;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        npc.rotation += rotDiff * 8 * dt;
      }

      // State behavior - free will AI
      if (!npc.isFrozen) switch (npc.state) {
        case 'idle':
          // Standing still, looking around occasionally
          npc.waitTime -= dt;
          if (npc.waitTime <= 0) {
            // Decide what to do next
            const decision = Math.random();
            if (decision < 0.5) {
              // 50% chance to walk somewhere
              const angle = Math.random() * Math.PI * 2;
              const radius = 10 + Math.random() * wanderRadius;
              const preferredX = npc.homeX + Math.cos(angle) * radius;
              const preferredZ = npc.homeZ + Math.sin(angle) * radius;
              // Find a safe target (not in water)
              const safeTarget = findSafeTarget(npc.x, npc.z, preferredX, preferredZ, getTerrainHeight);
              npc.targetX = safeTarget.x;
              npc.targetZ = safeTarget.z;
              npc.state = 'walking';
            } else if (decision < 0.8 && npc.isRunner) {
              // 30% chance to run (only for runners)
              const angle = Math.random() * Math.PI * 2;
              const radius = 30 + Math.random() * wanderRadius * 2;
              const preferredX = npc.homeX + Math.cos(angle) * radius;
              const preferredZ = npc.homeZ + Math.sin(angle) * radius;
              // Find a safe target (not in water)
              const safeTarget = findSafeTarget(npc.x, npc.z, preferredX, preferredZ, getTerrainHeight);
              npc.targetX = safeTarget.x;
              npc.targetZ = safeTarget.z;
              npc.state = 'running';
            } else if (decision < 0.9 && npc.isFlyer) {
              // 10% chance to fly (only for flyers)
              const angle = Math.random() * Math.PI * 2;
              const radius = 50 + Math.random() * wanderRadius * 3; // Fly further
              // Flying doesn't need safe target check for water, but we want them to land safely eventually
              // For now, just pick a point
              npc.targetX = npc.homeX + Math.cos(angle) * radius;
              npc.targetZ = npc.homeZ + Math.sin(angle) * radius;
              npc.state = 'flying';
            } else {
              // Stay idle longer, maybe turn around
              npc.waitTime = 2 + Math.random() * 4;
              npc.rotation += (Math.random() - 0.5) * Math.PI * 0.5;
            }
          }
          break;

        case 'walking':
          {
            moveTowards(npc, npc.targetX, npc.targetZ, npc.walkSpeed, dt, playerX, playerZ, getTerrainHeight);

            const distToTarget = Math.sqrt(
              Math.pow(npc.targetX - npc.x, 2) +
              Math.pow(npc.targetZ - npc.z, 2)
            );

            if (distToTarget < 2) {
              npc.state = 'idle';
              npc.waitTime = 2 + Math.random() * 5;
              npc.homeX = npc.x;
              npc.homeZ = npc.z;
            }
          }
          break;

        case 'running':
          {
            const runSpeed = npc.walkSpeed * npc.runSpeedMultiplier;
            moveTowards(npc, npc.targetX, npc.targetZ, runSpeed, dt, playerX, playerZ, getTerrainHeight);

            const distToTarget = Math.sqrt(
              Math.pow(npc.targetX - npc.x, 2) +
              Math.pow(npc.targetZ - npc.z, 2)
            );

            if (distToTarget < 3) {
              // After running, take a longer rest
              npc.state = 'idle';
              npc.waitTime = 3 + Math.random() * 4;
              npc.homeX = npc.x;
              npc.homeZ = npc.z;
            }
          }
          break;

        case 'flying':
          {
            const speed = npc.walkSpeed * npc.flySpeedMultiplier;
            // Use moveTowards for X/Z movement (it handles rotation)
            // We pass null for getTerrainHeight to avoid water avoidance logic interfering with flight path
            // (Flyers can fly over water)
            moveTowards(npc, npc.targetX, npc.targetZ, speed, dt, playerX, playerZ, null);

            const distToTarget = Math.sqrt(
              Math.pow(npc.targetX - npc.x, 2) +
              Math.pow(npc.targetZ - npc.z, 2)
            );

            if (distToTarget < 5) {
              // Land
              npc.state = 'idle';
              npc.waitTime = 2 + Math.random() * 3;
              npc.homeX = npc.x;
              npc.homeZ = npc.z;
            }
          }
          break;
      }

      // Update Y position
      if (getTerrainHeight) {
        const terrainH = getTerrainHeight(npc.x, npc.z);
        let targetY = terrainH;
        
        if (npc.state === 'flying') {
          targetY = terrainH + flyHeight;
        }
        
        // Smooth Y transition (takeoff/landing)
        const yLerp = 2.0 * dt; // Adjust speed of ascent/descent
        npc.y = npc.y + (targetY - npc.y) * yLerp;
        
        // Ensure never below terrain
        if (npc.y < terrainH) npc.y = terrainH;
      }

      // Update NPC animation based on state
      let targetAnim = 'Idle';
      if (!npc.isFrozen) {
        if (npc.state === 'walking') targetAnim = 'Walk';
        else if (npc.state === 'running') targetAnim = 'Run';
        else if (npc.state === 'flying') targetAnim = 'Fly';
      }

      // Update animation reference (NPCs share animation pools)
      npc.currentAnimation = targetAnim;
    }

    // Update shared animation systems once (not per NPC)
    if (sharedAnimations) {
      for (const [name, anim] of Object.entries(sharedAnimations)) {
        anim.system.update(dt);
        device.queue.writeBuffer(anim.buffer, 0, anim.system.getBoneMatrices());
      }
    }
    
    // Update bind groups for NPCs whose animation changed
    updateBindGroupsIfNeeded();
  }

  /**
   * Create bind groups for NPCs (called once pipelines are ready)
   * Creates bind groups for ALL animation types upfront to avoid runtime recreation
   */
  let savedLayouts = null;
  let savedBuffers = null;
  
  function createBindGroups(characterLayout, shadowCharacterLayout, cameraBuffer, lightBuffer, shadowMapTexture, shadowMapSampler) {
    console.log(`🔗 Creating bind groups for ${npcs.length} NPCs (3 animations each)...`);
    
    // Save layouts and buffers for reference
    savedLayouts = { characterLayout, shadowCharacterLayout };
    savedBuffers = { cameraBuffer, lightBuffer, shadowMapTexture, shadowMapSampler };
    
    for (const npc of npcs) {
      // Create NPC-specific uniform buffer for model matrix + color
      // Character struct: mat4x4f (64 bytes) + vec3f (12 bytes) + pad (4 bytes) = 80 bytes
      if (!npc.uniformBuffer) {
        npc.uniformBuffer = device.createBuffer({
          size: 80, // mat4x4f (64) + vec3f (12) + f32 pad (4)
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
      }

      // Create bind groups for ALL animation types upfront
      npc.bindGroups = {};
      npc.shadowBindGroups = {};
      
      for (const [animName, anim] of Object.entries(sharedAnimations)) {
        if (!anim.buffer) continue;
        
        npc.bindGroups[animName] = device.createBindGroup({
          layout: characterLayout,
          entries: [
            { binding: 0, resource: { buffer: cameraBuffer } },
            { binding: 1, resource: { buffer: npc.uniformBuffer } },
            { binding: 2, resource: npc.texture.createView() },
            { binding: 3, resource: npc.sampler },
            { binding: 4, resource: { buffer: anim.buffer } },
            { binding: 5, resource: { buffer: lightBuffer } },
            { binding: 6, resource: shadowMapTexture.createView() },
            { binding: 7, resource: shadowMapSampler },
          ],
        });

        npc.shadowBindGroups[animName] = device.createBindGroup({
          layout: shadowCharacterLayout,
          entries: [
            { binding: 0, resource: { buffer: lightBuffer } },
            { binding: 1, resource: { buffer: npc.uniformBuffer } },
            { binding: 2, resource: { buffer: anim.buffer } },
          ],
        });
      }
      
      // Set initial bind group based on current animation
      npc.bindGroup = npc.bindGroups[npc.currentAnimation];
      npc.shadowBindGroup = npc.shadowBindGroups[npc.currentAnimation];
    }
    console.log(`✅ NPC bind groups created: ${npcs.length} NPCs × 3 animations = ${npcs.length * 3} bind groups`);
  }
  
  /**
   * Update bind group references for NPCs whose animation changed
   * This is now just a pointer swap, not a GPU resource creation
   */
  function updateBindGroupsIfNeeded() {
    if (!sharedAnimations) return;
    
    for (const npc of npcs) {
      if (!npc.bindGroups || !npc.shadowBindGroups) continue;
      
      // Just swap the bind group reference - no GPU resource creation!
      const newBindGroup = npc.bindGroups[npc.currentAnimation];
      const newShadowBindGroup = npc.shadowBindGroups[npc.currentAnimation];
      
      if (newBindGroup && newShadowBindGroup) {
        npc.bindGroup = newBindGroup;
        npc.shadowBindGroup = newShadowBindGroup;
      }
    }
  }

  // Counter for debug logging
  let uniformLogCounter = 0;

  /**
   * Update NPC uniform buffers (model matrices + color)
   */
  function updateUniforms(characterScale) {
    uniformLogCounter++;
    const shouldLog = uniformLogCounter === 1 || uniformLogCounter % 600 === 0;
    
    for (const npc of npcs) {
      if (!npc.uniformBuffer) continue;

      // Create model matrix: translate, rotate, scale
      const cos = Math.cos(npc.rotation);
      const sin = Math.sin(npc.rotation);
      const s = characterScale;

      // Buffer layout: mat4x4f (16 floats) + vec3f (3 floats) + pad (1 float) = 20 floats = 80 bytes
      const [cr, cg, cb] = npc.colorRgb || [1, 1, 1];
      const uniformData = new Float32Array([
        // Model matrix (4x4)
        cos * s, 0, -sin * s, 0,
        0, s, 0, 0,
        sin * s, 0, cos * s, 0,
        npc.x, npc.y, npc.z, 1,
        // Color (vec3f) + pad
        cr, cg, cb, 0.0,
      ]);

      device.queue.writeBuffer(npc.uniformBuffer, 0, uniformData);
      
      // Log first NPC's data periodically
      if (shouldLog && npc.id === 0) {
        console.log(`📊 NPC 0 uniform data:`, {
          scale: s,
          pos: [npc.x.toFixed(1), npc.y.toFixed(1), npc.z.toFixed(1)],
          color: [cr.toFixed(2), cg.toFixed(2), cb.toFixed(2)],
          rotation: npc.rotation.toFixed(2),
        });
      }
    }
  }

  /**
   * Render NPCs to shadow map
   */
  function renderShadows(shadowPass, shadowPipeline) {
    if (!isLoaded) return;

    for (const npc of npcs) {
      if (!npc.shadowBindGroup) continue;

      shadowPass.setPipeline(shadowPipeline);
      shadowPass.setBindGroup(0, npc.shadowBindGroup);
      shadowPass.setVertexBuffer(0, npc.vertexBuffer);
      shadowPass.setIndexBuffer(npc.indexBuffer, 'uint32');
      shadowPass.drawIndexed(npc.indexCount);
    }
  }

  // Counter for periodic logging
  let renderLogCounter = 0;

  /**
   * Render NPCs to main pass
   */
  function render(renderPass, characterPipeline) {
    if (!isLoaded) {
      renderLogCounter++;
      if (renderLogCounter % 600 === 1) {
        console.log('⚠️ NPC render skipped: not loaded');
      }
      return;
    }

    let rendered = 0;
    let skipped = 0;
    for (const npc of npcs) {
      if (!npc.bindGroup) {
        skipped++;
        continue;
      }
      if (!npc.vertexBuffer || !npc.indexBuffer) {
        skipped++;
        continue;
      }

      renderPass.setPipeline(characterPipeline);
      renderPass.setBindGroup(0, npc.bindGroup);
      renderPass.setVertexBuffer(0, npc.vertexBuffer);
      renderPass.setIndexBuffer(npc.indexBuffer, 'uint32');
      renderPass.drawIndexed(npc.indexCount);
      rendered++;
    }
    
    // Log every 10 seconds (~600 frames at 60fps)
    renderLogCounter++;
    if (renderLogCounter % 600 === 1) {
      console.log(`🎭 NPCs: ${rendered} rendered, ${skipped} skipped (no bindGroup/buffers)`);
      if (rendered > 0) {
        const npc = npcs[0];
        console.log(`   First NPC pos: (${npc.x.toFixed(1)}, ${npc.y.toFixed(1)}, ${npc.z.toFixed(1)})`);
      }
    }
  }

  /**
   * Get all NPCs
   */
  function getNPCs() {
    return npcs;
  }

  /**
   * Get NPC count
   */
  function getCount() {
    return npcs.length;
  }

  /**
   * Check if system is ready
   */
  function isReady() {
    return isLoaded;
  }

  return {
    init,
    update,
    createBindGroups,
    updateUniforms,
    renderShadows,
    render,
    getNPCs,
    getCount,
    isReady,
  };
}
