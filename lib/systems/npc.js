/**
 * NPC System - Multiple Ready Player Me avatars with AI behavior
 * Modular implementation for WebGPU
 */

import {
  CONFIG,
  loadGLB,
  loadTextureFromGLB,
  extractMeshData,
  extractSkeleton,
  extractSkinningData,
  extractAnimations,
  createCharacterBuffers,
  AnimationSystem,
} from '../index.js';

// Ready Player Me avatar URLs - 10 different avatars
const NPC_AVATARS = [
  'https://models.readyplayer.me/6818e06aff7c9bc94b4c4efb.glb?lod=2&morphTargets=none&textureAtlas=1024&pose=A',
  'https://models.readyplayer.me/6818e0edff7c9bc94b4c5104.glb?lod=2&morphTargets=none&textureAtlas=1024&pose=A',
  'https://models.readyplayer.me/6818e14f8b60d3b7ce75b8e4.glb?lod=2&morphTargets=none&textureAtlas=1024&pose=A',
  'https://models.readyplayer.me/6818e1ae8b60d3b7ce75ba16.glb?lod=2&morphTargets=none&textureAtlas=1024&pose=A',
  'https://models.readyplayer.me/6818e1f0ff7c9bc94b4c5545.glb?lod=2&morphTargets=none&textureAtlas=1024&pose=A',
  'https://models.readyplayer.me/6818e24e8b60d3b7ce75bdee.glb?lod=2&morphTargets=none&textureAtlas=1024&pose=A',
  'https://models.readyplayer.me/6818e2a18b60d3b7ce75bf20.glb?lod=2&morphTargets=none&textureAtlas=1024&pose=A',
  'https://models.readyplayer.me/6818e2f1ff7c9bc94b4c5a2d.glb?lod=2&morphTargets=none&textureAtlas=1024&pose=A',
  'https://models.readyplayer.me/6818e3388b60d3b7ce75c1fe.glb?lod=2&morphTargets=none&textureAtlas=1024&pose=A',
  'https://models.readyplayer.me/6818e3818b60d3b7ce75c330.glb?lod=2&morphTargets=none&textureAtlas=1024&pose=A',
];

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
    npcCount = 10,
    terrainSize = CONFIG.geometry.terrain.size,
    detectionRadius = 40,
    stopDistance = 8,
    wanderRadius = 30,
    minSeparation = 4,
    baseSpeed = 15,
  } = options;

  const MAX_BONES = CONFIG.animation.maxBones;

  // NPCs array
  const npcs = [];

  // Shared animation data (loaded once)
  let sharedAnimations = null;
  let animSkeleton = null;

  // Loading state
  let isLoading = false;
  let isLoaded = false;

  /**
   * Load shared animations from GLB
   */
  async function loadSharedAnimations() {
    if (sharedAnimations) return;

    console.log('📦 Loading shared NPC animations...');
    const animGlb = await loadGLB(CONFIG.assets.animations);
    sharedAnimations = extractAnimations(animGlb.json, animGlb.bin);
    animSkeleton = extractSkeleton(animGlb.json, animGlb.bin);
    console.log('✅ Shared animations loaded');
  }

  /**
   * Load a single NPC
   */
  async function loadNPC(index, avatarUrl) {
    try {
      console.log(`🧍 Loading NPC ${index + 1}/${npcCount}...`);

      const avatarGlb = await loadGLB(avatarUrl);
      const meshData = extractMeshData(avatarGlb.json, avatarGlb.bin);
      const skeleton = extractSkeleton(avatarGlb.json, avatarGlb.bin);
      const skinningData = extractSkinningData(avatarGlb.json, avatarGlb.bin);

      // Create bone mapping for retargeting
      const boneMapping = {};
      if (skeleton && animSkeleton) {
        for (const avatarBone of skeleton.joints) {
          if (animSkeleton.joints.includes(avatarBone)) {
            boneMapping[avatarBone] = avatarBone;
          } else {
            const avatarNormalized = avatarBone.toLowerCase().replace(/[_.\s]/g, '');
            for (const animBone of animSkeleton.joints) {
              const animNormalized = animBone.toLowerCase().replace(/[_.\s]/g, '');
              if (avatarNormalized === animNormalized ||
                avatarNormalized.includes(animNormalized) ||
                animNormalized.includes(avatarNormalized)) {
                boneMapping[animBone] = avatarBone;
                break;
              }
            }
          }
        }
      }

      // Retarget animations
      const retargetedAnims = {};
      for (const [name, anim] of Object.entries(sharedAnimations)) {
        retargetedAnims[name] = {
          ...anim,
          tracks: anim.tracks.map(track => ({
            ...track,
            nodeName: boneMapping[track.nodeName] || track.nodeName
          }))
        };
      }

      // Create animation system for this NPC
      const animationSystem = new AnimationSystem(skeleton, retargetedAnims);

      // Create bone matrices buffer
      const boneMatricesBuffer = device.createBuffer({
        size: MAX_BONES * 16 * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      // Initialize with identity matrices
      const identityMatrices = new Float32Array(MAX_BONES * 16);
      for (let i = 0; i < MAX_BONES; i++) {
        identityMatrices[i * 16 + 0] = 1;
        identityMatrices[i * 16 + 5] = 1;
        identityMatrices[i * 16 + 10] = 1;
        identityMatrices[i * 16 + 15] = 1;
      }
      device.queue.writeBuffer(boneMatricesBuffer, 0, identityMatrices);

      // Create GPU buffers
      const buffers = createCharacterBuffers(meshData, skinningData);

      const vertexBuffer = device.createBuffer({
        size: buffers.vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(vertexBuffer, 0, buffers.vertices);

      const indexBuffer = device.createBuffer({
        size: buffers.indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(indexBuffer, 0, buffers.indices);

      // Load texture
      let texture = null;
      const textureIndices = new Set();
      for (const mesh of meshData) {
        if (mesh.baseColorTextureIndex !== null) {
          textureIndices.add(mesh.baseColorTextureIndex);
        }
      }

      for (const texIdx of textureIndices) {
        const tex = await loadTextureFromGLB(avatarGlb.json, avatarGlb.bin, texIdx, device);
        if (tex) {
          texture = tex;
          break;
        }
      }

      // Fallback texture
      if (!texture) {
        texture = device.createTexture({
          size: [1, 1, 1],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture(
          { texture },
          new Uint8Array([255, 255, 255, 255]),
          { bytesPerRow: 4 },
          [1, 1, 1]
        );
      }

      const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      });

      // Calculate spawn position (spiral pattern)
      const angle = (index / npcCount) * Math.PI * 4;
      const radius = 30 + (index / npcCount) * (terrainSize * 0.3);
      const homeX = Math.cos(angle) * radius;
      const homeZ = Math.sin(angle) * radius;

      // NPC object
      const npc = {
        id: index,
        name: NPC_NAMES[index % NPC_NAMES.length],
        color: NPC_COLORS[index % NPC_COLORS.length],

        // GPU resources
        vertexBuffer,
        indexBuffer,
        indexCount: buffers.indices.length,
        texture,
        sampler,
        boneMatricesBuffer,
        animationSystem,

        // Position & movement
        x: homeX,
        y: 0,
        z: homeZ,
        rotation: Math.random() * Math.PI * 2,
        homeX,
        homeZ,
        targetX: homeX,
        targetZ: homeZ,

        // State
        state: 'idle', // idle, walking, following
        currentAnim: 'Idle',
        waitTime: Math.random() * 3,
        isRunner: Math.random() < 0.3,
        speed: baseSpeed * (Math.random() < 0.3 ? 2.5 : 1),

        // Bind group (created lazily)
        bindGroup: null,
        shadowBindGroup: null,
      };

      // Start with idle animation
      if (retargetedAnims['Idle']) {
        animationSystem.play('Idle');
      }

      return npc;

    } catch (err) {
      console.error(`Failed to load NPC ${index}:`, err);
      return null;
    }
  }

  /**
   * Initialize all NPCs
   */
  async function init() {
    if (isLoading || isLoaded) return;
    isLoading = true;

    console.log(`🎮 Initializing NPC System (${npcCount} NPCs)...`);

    // Load shared animations first
    await loadSharedAnimations();

    // Load NPCs in parallel (batched to avoid overwhelming)
    const batchSize = 3;
    for (let i = 0; i < npcCount; i += batchSize) {
      const batch = [];
      for (let j = i; j < Math.min(i + batchSize, npcCount); j++) {
        const avatarUrl = NPC_AVATARS[j % NPC_AVATARS.length];
        batch.push(loadNPC(j, avatarUrl));
      }
      const results = await Promise.all(batch);
      for (const npc of results) {
        if (npc) npcs.push(npc);
      }
    }

    isLoaded = true;
    isLoading = false;
    console.log(`✅ NPC System initialized: ${npcs.length} NPCs loaded`);
  }

  /**
   * Play animation for an NPC
   */
  function playAnimation(npc, animName) {
    if (!npc.animationSystem) return;

    const clips = ['Idle', 'Walk', 'Run', 'Jump'];
    const targetClip = clips.find(c => c.toLowerCase().includes(animName.toLowerCase())) || 'Idle';

    if (npc.currentAnim !== targetClip) {
      npc.animationSystem.play(targetClip);
      npc.currentAnim = targetClip;
    }
  }

  /**
   * Move NPC towards target with collision avoidance
   */
  function moveTowards(npc, targetX, targetZ, speed, dt, playerX, playerZ) {
    const dx = targetX - npc.x;
    const dz = targetZ - npc.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.5) {
      let moveX = (dx / dist) * speed * dt;
      let moveZ = (dz / dist) * speed * dt;

      let newX = npc.x + moveX;
      let newZ = npc.z + moveZ;

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

      // Clamp to terrain bounds
      const halfSize = terrainSize / 2 - 10;
      newX = Math.max(-halfSize, Math.min(halfSize, newX));
      newZ = Math.max(-halfSize, Math.min(halfSize, newZ));

      npc.x = newX;
      npc.z = newZ;

      // Rotate towards movement direction
      const targetRotation = Math.atan2(dx, dz);
      let rotDiff = targetRotation - npc.rotation;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      npc.rotation += rotDiff * 5 * dt;
    }
  }

  /**
   * Update all NPCs
   */
  function update(dt, playerX, playerY, playerZ, getTerrainHeight) {
    if (!isLoaded) return;

    for (const npc of npcs) {
      const dx = playerX - npc.x;
      const dz = playerZ - npc.z;
      const distToPlayer = Math.sqrt(dx * dx + dz * dz);

      const isNearPlayer = distToPlayer < detectionRadius;

      // State transitions
      if (isNearPlayer && npc.state !== 'following') {
        npc.state = 'following';
      } else if (!isNearPlayer && npc.state === 'following') {
        npc.state = 'idle';
        npc.waitTime = 2;
      }

      // State behavior
      switch (npc.state) {
        case 'idle':
          playAnimation(npc, 'idle');
          npc.waitTime -= dt;
          if (npc.waitTime <= 0) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * wanderRadius;
            npc.targetX = npc.homeX + Math.cos(angle) * radius;
            npc.targetZ = npc.homeZ + Math.sin(angle) * radius;
            npc.state = 'walking';
          }
          break;

        case 'walking':
          {
            const moveAnim = npc.isRunner ? 'run' : 'walk';
            playAnimation(npc, moveAnim);
            moveTowards(npc, npc.targetX, npc.targetZ, npc.speed, dt, playerX, playerZ);

            const distToTarget = Math.sqrt(
              Math.pow(npc.targetX - npc.x, 2) +
              Math.pow(npc.targetZ - npc.z, 2)
            );

            if (distToTarget < 2) {
              npc.state = 'idle';
              npc.waitTime = 2 + Math.random() * 3;
            }
          }
          break;

        case 'following':
          {
            if (distToPlayer > stopDistance) {
              const moveAnim = npc.isRunner ? 'run' : 'walk';
              playAnimation(npc, moveAnim);
              moveTowards(npc, playerX, playerZ, npc.speed * 1.2, dt, playerX, playerZ);
            } else {
              playAnimation(npc, 'idle');
              // Look at player
              const angleToPlayer = Math.atan2(dx, dz);
              let rotDiff = angleToPlayer - npc.rotation;
              while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
              while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
              npc.rotation += rotDiff * 3 * dt;
            }
          }
          break;
      }

      // Update Y position to terrain
      if (getTerrainHeight) {
        npc.y = getTerrainHeight(npc.x, npc.z);
      }

      // Update animation
      if (npc.animationSystem) {
        npc.animationSystem.update(dt);
        device.queue.writeBuffer(npc.boneMatricesBuffer, 0, npc.animationSystem.getBoneMatrices());
      }
    }
  }

  /**
   * Create bind groups for NPCs (called once pipelines are ready)
   */
  function createBindGroups(characterLayout, shadowCharacterLayout, cameraBuffer, lightBuffer, shadowMapTexture, shadowMapSampler) {
    for (const npc of npcs) {
      // Create NPC-specific uniform buffer for model matrix
      if (!npc.uniformBuffer) {
        npc.uniformBuffer = device.createBuffer({
          size: 64, // 4x4 matrix
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
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
    }
    console.log(`✅ NPC bind groups created for ${npcs.length} NPCs`);
  }

  /**
   * Update NPC uniform buffers (model matrices)
   */
  function updateUniforms(characterScale) {
    for (const npc of npcs) {
      if (!npc.uniformBuffer) continue;

      // Create model matrix: translate, rotate, scale
      const cos = Math.cos(npc.rotation);
      const sin = Math.sin(npc.rotation);
      const s = characterScale;

      const modelMatrix = new Float32Array([
        cos * s, 0, -sin * s, 0,
        0, s, 0, 0,
        sin * s, 0, cos * s, 0,
        npc.x, npc.y, npc.z, 1,
      ]);

      device.queue.writeBuffer(npc.uniformBuffer, 0, modelMatrix);
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

  /**
   * Render NPCs to main pass
   */
  function render(renderPass, characterPipeline) {
    if (!isLoaded) return;

    for (const npc of npcs) {
      if (!npc.bindGroup) continue;

      renderPass.setPipeline(characterPipeline);
      renderPass.setBindGroup(0, npc.bindGroup);
      renderPass.setVertexBuffer(0, npc.vertexBuffer);
      renderPass.setIndexBuffer(npc.indexBuffer, 'uint32');
      renderPass.drawIndexed(npc.indexCount);
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
