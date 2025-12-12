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
    detectionRadius = 500,  // Large radius - NPCs always follow player
    stopDistance = 5,       // Stop closer to player
    wanderRadius = 15,
    minSeparation = 3,
    baseSpeed = 12,
  } = options;

  // NPCs array
  const npcs = [];

  // Loading state
  let isLoading = false;
  let isLoaded = false;

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
    while (true) {
      const avatarReady = !!(
        characterSystem.avatarLoaded &&
        characterSystem.avatarVB &&
        characterSystem.avatarIB &&
        characterSystem.avatarIndexCount &&
        characterSystem.avatarTexture &&
        characterSystem.avatarSampler &&
        characterSystem.boneMatricesBuffer
      );
      if (avatarReady) break;

      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now - start > timeoutMs) {
        console.error('❌ NPC System timed out waiting for avatar resources.');
        isLoading = false;
        return;
      }
      await sleep(50);
    }

    // Create NPC instances reusing the same GPU resources and the same bone matrices buffer
    for (let index = 0; index < npcCount; index++) {
      const angle = (index / npcCount) * Math.PI * 2;
      const radius = 8 + (index % 3) * 4;
      const homeX = Math.cos(angle) * radius;
      const homeZ = Math.sin(angle) * radius;
      const colorHex = NPC_COLORS[index % NPC_COLORS.length];
      const [cr, cg, cb] = hexToRgb01(colorHex);

      npcs.push({
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
        boneMatricesBuffer: characterSystem.boneMatricesBuffer,

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
        state: 'following',
        waitTime: Math.random() * 1.5,
        isRunner: Math.random() < 0.3,
        speed: baseSpeed * (Math.random() < 0.3 ? 2.0 : 1),

        // Bind group (created lazily)
        bindGroup: null,
        shadowBindGroup: null,
        uniformBuffer: null,
      });
    }

    isLoaded = true;
    isLoading = false;
    console.log(`✅ NPC System initialized: ${npcs.length} NPCs loaded`);
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
              moveTowards(npc, playerX, playerZ, npc.speed * 1.2, dt, playerX, playerZ);
            } else {
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
    }
  }

  /**
   * Create bind groups for NPCs (called once pipelines are ready)
   */
  function createBindGroups(characterLayout, shadowCharacterLayout, cameraBuffer, lightBuffer, shadowMapTexture, shadowMapSampler) {
    for (const npc of npcs) {
      // Create NPC-specific uniform buffer for model matrix + color
      // Character struct: mat4x4f (64 bytes) + vec3f (12 bytes) + pad (4 bytes) = 80 bytes
      if (!npc.uniformBuffer) {
        npc.uniformBuffer = device.createBuffer({
          size: 80, // mat4x4f (64) + vec3f (12) + f32 pad (4)
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
   * Update NPC uniform buffers (model matrices + color)
   */
  function updateUniforms(characterScale) {
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
