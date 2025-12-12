/**
 * NPC System - Multiple avatars with AI behavior
 * Note: NPCs reuse the player's avatar GPU resources (same GLB format) and the
 * player's bone matrices buffer (same animations) via `characterSystem`.
 */

import { CONFIG } from '../index.js';

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
    npcCount = 10,
    terrainSize = CONFIG.geometry.terrain.size,
    detectionRadius = 15,     // Only follow when player is very close (15 units)
    stopDistance = 4,         // Stop when close to player
    wanderRadius = 50,        // Larger wander area for free roaming
    minSeparation = 3,
    baseSpeed = 8,            // Base walking speed
    runSpeed = 16,            // Running speed
  } = options;

  // NPCs array
  const npcs = [];

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
        boneMatricesBuffer: !!characterSystem.boneMatricesBuffer
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

    // Create NPC instances reusing the same GPU resources and the same bone matrices buffer
    // NPCs spawn very close to the origin (player starts at 0,0,terrainHeight)
    console.log(`📍 Creating ${npcCount} NPCs reusing player avatar resources:`);
    console.log(`   - avatarVB: ${characterSystem.avatarVB ? 'OK' : 'MISSING'}`);
    console.log(`   - avatarIB: ${characterSystem.avatarIB ? 'OK' : 'MISSING'}`);
    console.log(`   - indexCount: ${characterSystem.avatarIndexCount}`);
    console.log(`   - texture: ${characterSystem.avatarTexture ? 'OK' : 'MISSING'}`);
    console.log(`   - sampler: ${characterSystem.avatarSampler ? 'OK' : 'MISSING'}`);
    console.log(`   - boneMatricesBuffer: ${characterSystem.boneMatricesBuffer ? 'OK' : 'MISSING'}`);

    // NPCs share the player's bone matrices buffer for synchronized animations
    // This means all NPCs will have the same pose as the player
    const sharedBoneMatricesBuffer = characterSystem.boneMatricesBuffer;
    console.log('✅ NPCs will share player animations (synchronized poses)');
    
    for (let index = 0; index < npcCount; index++) {
      const angle = (index / npcCount) * Math.PI * 2;
      const radius = 3 + (index % 3) * 2;  // Very close: 3, 5, 7 units from origin
      const homeX = Math.cos(angle) * radius;
      const homeZ = Math.sin(angle) * radius;
      const colorHex = NPC_COLORS[index % NPC_COLORS.length];
      const [cr, cg, cb] = hexToRgb01(colorHex);

      const npc = {
        id: index,
        name: NPC_NAMES[index % NPC_NAMES.length],
        color: colorHex,
        colorRgb: [cr, cg, cb],

        // Shared GPU resources (same format as the player avatar)
        vertexBuffer: characterSystem.avatarVB,
        indexBuffer: characterSystem.avatarIB,
        indexCount: characterSystem.avatarIndexCount,
        texture: characterSystem.avatarTexture,
        sampler: characterSystem.avatarSampler,
        // Share player's bone matrices for synchronized animations
        boneMatricesBuffer: sharedBoneMatricesBuffer,

        // Position & movement - start very close to origin
        x: homeX,
        y: 0,
        z: homeZ,
        rotation: Math.random() * Math.PI * 2,
        homeX,
        homeZ,
        targetX: homeX,
        targetZ: homeZ,

        // State - start idle, will begin wandering
        state: 'idle',
        waitTime: Math.random() * 3,  // Random initial wait
        isRunner: Math.random() < 0.3,  // 30% chance to be a runner
        walkSpeed: baseSpeed * (0.8 + Math.random() * 0.4),  // Varied walk speeds
        runSpeedMultiplier: 1.5 + Math.random() * 0.5,  // Varied run speeds

        // Bind group (created lazily)
        bindGroup: null,
        shadowBindGroup: null,
        uniformBuffer: null,
      };
      
      console.log(`  NPC ${index}: pos(${homeX.toFixed(1)}, ${homeZ.toFixed(1)}), indexCount=${npc.indexCount}`);
      npcs.push(npc);
    }

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

    // Teleport NPCs near player on first update (player position now known)
    if (!hasSpawnedNearPlayer) {
      hasSpawnedNearPlayer = true;
      console.log(`📍 Teleporting NPCs near player at (${playerX.toFixed(1)}, ${playerZ.toFixed(1)})...`);
      
      for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];
        const angle = (i / npcs.length) * Math.PI * 2;
        const radius = 3 + (i % 3) * 2;  // 3, 5, 7 units from player
        
        npc.x = playerX + Math.cos(angle) * radius;
        npc.z = playerZ + Math.sin(angle) * radius;
        npc.homeX = npc.x;
        npc.homeZ = npc.z;
        npc.targetX = npc.x;
        npc.targetZ = npc.z;
        
        // Set Y to terrain height
        if (getTerrainHeight) {
          npc.y = getTerrainHeight(npc.x, npc.z);
        }
        
        console.log(`  NPC ${i}: teleported to (${npc.x.toFixed(1)}, ${npc.z.toFixed(1)})`);
      }
    }

    for (const npc of npcs) {
      const dx = playerX - npc.x;
      const dz = playerZ - npc.z;
      const distToPlayer = Math.sqrt(dx * dx + dz * dz);

      // Only follow if player is very close (approaches the NPC)
      const playerApproached = distToPlayer < detectionRadius;

      // State transitions - NPCs have free will
      if (playerApproached && npc.state !== 'following') {
        // Player approached this NPC - start following
        npc.state = 'following';
      } else if (!playerApproached && npc.state === 'following') {
        // Player left - go back to wandering
        npc.state = 'idle';
        npc.waitTime = 1 + Math.random() * 2;
        // Update home position to current position
        npc.homeX = npc.x;
        npc.homeZ = npc.z;
      }

      // State behavior - free will AI
      switch (npc.state) {
        case 'idle':
          // Standing still, looking around occasionally
          npc.waitTime -= dt;
          if (npc.waitTime <= 0) {
            // Decide what to do next
            const decision = Math.random();
            if (decision < 0.6) {
              // 60% chance to walk somewhere
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
              // 20% chance to run (only for runners)
              const angle = Math.random() * Math.PI * 2;
              const radius = 30 + Math.random() * wanderRadius * 2;
              const preferredX = npc.homeX + Math.cos(angle) * radius;
              const preferredZ = npc.homeZ + Math.sin(angle) * radius;
              // Find a safe target (not in water)
              const safeTarget = findSafeTarget(npc.x, npc.z, preferredX, preferredZ, getTerrainHeight);
              npc.targetX = safeTarget.x;
              npc.targetZ = safeTarget.z;
              npc.state = 'running';
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

        case 'following':
          {
            if (distToPlayer > stopDistance) {
              // Walk towards player (not run - friendly approach)
              moveTowards(npc, playerX, playerZ, npc.walkSpeed * 1.1, dt, playerX, playerZ, getTerrainHeight);
            } else {
              // Standing near player - look at player with smooth rotation
              const angleToPlayer = Math.atan2(dx, dz);
              let rotDiff = angleToPlayer - npc.rotation;
              while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
              while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
              npc.rotation += rotDiff * 8 * dt;
            }
          }
          break;
      }

      // Update Y position to terrain
      if (getTerrainHeight) {
        npc.y = getTerrainHeight(npc.x, npc.z);
      }
    }
  }

  /**
   * Create bind groups for NPCs (called once pipelines are ready)
   */
  function createBindGroups(characterLayout, shadowCharacterLayout, cameraBuffer, lightBuffer, shadowMapTexture, shadowMapSampler) {
    console.log(`🔗 Creating bind groups for ${npcs.length} NPCs...`);
    
    for (const npc of npcs) {
      // Create NPC-specific uniform buffer for model matrix + color
      // Character struct: mat4x4f (64 bytes) + vec3f (12 bytes) + pad (4 bytes) = 80 bytes
      if (!npc.uniformBuffer) {
        npc.uniformBuffer = device.createBuffer({
          size: 80, // mat4x4f (64) + vec3f (12) + f32 pad (4)
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
      }

      // Verify all resources exist
      if (!npc.texture || !npc.sampler || !npc.boneMatricesBuffer) {
        console.error(`❌ NPC ${npc.id}: Missing resources - texture:${!!npc.texture}, sampler:${!!npc.sampler}, bones:${!!npc.boneMatricesBuffer}`);
        continue;
      }

      npc.bindGroup = device.createBindGroup({
        layout: characterLayout,
        entries: [
          { binding: 0, resource: { buffer: cameraBuffer } },
          { binding: 1, resource: { buffer: npc.uniformBuffer } },
          { binding: 2, resource: npc.texture.createView() },
          { binding: 3, resource: npc.sampler },
          { binding: 4, resource: { buffer: npc.boneMatricesBuffer } },
          { binding: 5, resource: { buffer: lightBuffer } },
          { binding: 6, resource: shadowMapTexture.createView() },
          { binding: 7, resource: shadowMapSampler },
        ],
      });

      npc.shadowBindGroup = device.createBindGroup({
        layout: shadowCharacterLayout,
        entries: [
          { binding: 0, resource: { buffer: lightBuffer } },
          { binding: 1, resource: { buffer: npc.uniformBuffer } },
          { binding: 2, resource: { buffer: npc.boneMatricesBuffer } },
        ],
      });
      
      console.log(`  ✓ NPC ${npc.id} bind groups created`);
    }
    console.log(`✅ NPC bind groups created for ${npcs.length} NPCs`);
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
