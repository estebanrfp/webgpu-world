/**
 * Character System - Avatar loading, animations, and rendering
 * Extracted from index.html
 */

import {
  CONFIG,
  AVATAR_URL,
  loadGLB,
  loadTextureFromGLB,
  extractMeshData,
  extractSkeleton,
  extractSkinningData,
  extractAnimations,
  createCharacterBuffers,
  AnimationSystem,
} from '../index.js';

/**
 * Creates the character system for avatar loading and animation
 * @param {GPUDevice} device - WebGPU device
 * @returns {Object} Character system with state and methods
 */
export function createCharacterSystem(device) {
  const MAX_BONES = CONFIG.animation.maxBones;

  // Animation system instance
  let animationSystem = null;
  let boneMatricesBuffer = null;

  // Store skeleton and animations for NPC reuse
  let avatarSkeleton = null;
  let avatarAnimations = null;

  // Avatar state
  let avatarVB = null, avatarIB = null, avatarIndexCount = 0;
  let avatarLoaded = false;
  let avatarTexture = null;
  let avatarSampler = null;

  // Start loading avatar asynchronously
  (async () => {
    try {
      console.log('Loading avatar from Ready Player Me...');
      const avatarGlb = await loadGLB(AVATAR_URL);
      const meshData = extractMeshData(avatarGlb.json, avatarGlb.bin);

      const skeleton = extractSkeleton(avatarGlb.json, avatarGlb.bin);
      const skinningData = extractSkinningData(avatarGlb.json, avatarGlb.bin);

      console.log('Loading animations...');
      const animGlb = await loadGLB(CONFIG.assets.animations);
      const animations = extractAnimations(animGlb.json, animGlb.bin);

      if (skeleton) {
        const animSkeleton = extractSkeleton(animGlb.json, animGlb.bin);

        if (animSkeleton) {
          console.log('Avatar bones:', skeleton.joints.length);
          console.log('Animation bones:', animSkeleton.joints.length);

          // Create bone name mapping for retargeting
          const boneMapping = {};
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

          console.log('Bone mapping:', Object.keys(boneMapping).length, 'mapped');

          // Retarget animations
          const retargetedAnims = {};
          for (const [name, anim] of Object.entries(animations)) {
            retargetedAnims[name] = {
              ...anim,
              tracks: anim.tracks.map(track => ({
                ...track,
                nodeName: boneMapping[track.nodeName] || track.nodeName
              }))
            };
          }

          // Store skeleton and animations for NPC reuse
          avatarSkeleton = skeleton;
          avatarAnimations = retargetedAnims;

          animationSystem = new AnimationSystem(skeleton, retargetedAnims);

          // Reuse existing buffer or create new one
          if (!boneMatricesBuffer) {
            boneMatricesBuffer = device.createBuffer({
              size: MAX_BONES * 16 * 4,
              usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
          }

          if (retargetedAnims['Idle']) {
            animationSystem.play('Idle');
          } else {
            const firstAnim = Object.keys(retargetedAnims)[0];
            if (firstAnim) animationSystem.play(firstAnim);
          }

          console.log('✅ Animation system initialized!');
        }
      }

      const buffers = createCharacterBuffers(meshData, skinningData);

      avatarVB = device.createBuffer({
        size: buffers.vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(avatarVB, 0, buffers.vertices);

      avatarIB = device.createBuffer({
        size: buffers.indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(avatarIB, 0, buffers.indices);

      // Load textures from GLB
      const textureIndices = new Set();
      for (const mesh of meshData) {
        if (mesh.baseColorTextureIndex !== null) {
          textureIndices.add(mesh.baseColorTextureIndex);
        }
      }

      console.log('Found textures:', [...textureIndices]);

      for (const texIdx of textureIndices) {
        const tex = await loadTextureFromGLB(avatarGlb.json, avatarGlb.bin, texIdx, device);
        if (tex) {
          avatarTexture = tex;
          console.log('✅ Avatar texture loaded!');
          break;
        }
      }

      if (!avatarTexture) {
        console.log('No texture found, creating default');
        avatarTexture = device.createTexture({
          size: [1, 1, 1],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture(
          { texture: avatarTexture },
          new Uint8Array([255, 255, 255, 255]),
          { bytesPerRow: 4 },
          [1, 1, 1]
        );
      }

      avatarSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      });

      avatarIndexCount = buffers.indices.length;
      avatarLoaded = true;

      // Debug bounds
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < buffers.vertices.length; i += 8) {
        minX = Math.min(minX, buffers.vertices[i]);
        maxX = Math.max(maxX, buffers.vertices[i]);
        minY = Math.min(minY, buffers.vertices[i + 1]);
        maxY = Math.max(maxY, buffers.vertices[i + 1]);
        minZ = Math.min(minZ, buffers.vertices[i + 2]);
        maxZ = Math.max(maxZ, buffers.vertices[i + 2]);
      }
      console.log('✅ Avatar loaded!', avatarIndexCount, 'indices');
      console.log(`Avatar bounds: X[${minX.toFixed(2)}, ${maxX.toFixed(2)}] Y[${minY.toFixed(2)}, ${maxY.toFixed(2)}] Z[${minZ.toFixed(2)}, ${maxZ.toFixed(2)}]`);
    } catch (e) {
      console.error('Failed to load avatar:', e);
    }
  })();

  /**
   * Ensures boneMatricesBuffer exists (creates default identity matrices if needed)
   */
  function ensureBoneMatricesBuffer() {
    if (!boneMatricesBuffer) {
      boneMatricesBuffer = device.createBuffer({
        size: MAX_BONES * 16 * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      const identityMatrices = new Float32Array(MAX_BONES * 16);
      for (let i = 0; i < MAX_BONES; i++) {
        identityMatrices[i * 16 + 0] = 1;
        identityMatrices[i * 16 + 5] = 1;
        identityMatrices[i * 16 + 10] = 1;
        identityMatrices[i * 16 + 15] = 1;
      }
      device.queue.writeBuffer(boneMatricesBuffer, 0, identityMatrices);
    }
    return boneMatricesBuffer;
  }

  /**
   * Updates animation based on movement state
   */
  function updateAnimation(dt, state) {
    if (!animationSystem) return;

    const { isMoving, isSprinting, isFlying, isJumping, isFalling, isSwimming, isSprintSwimming } = state;

    let targetAnim = 'Idle';

    if (isSwimming) {
      targetAnim = 'Floating';
    } else if (isFlying) {
      targetAnim = 'Floating';
    } else if (isFalling) {
      targetAnim = 'Jump';
    } else if (isJumping) {
      targetAnim = 'Jump';
    } else if (isMoving && isSprinting) {
      targetAnim = 'Run';
    } else if (isMoving) {
      targetAnim = 'Walk';
    }

    if (animationSystem.currentAnimation?.name !== targetAnim) {
      animationSystem.play(targetAnim);
    }

    animationSystem.update(dt);
    device.queue.writeBuffer(boneMatricesBuffer, 0, animationSystem.getBoneMatrices());
  }

  return {
    get animationSystem() { return animationSystem; },
    get boneMatricesBuffer() { return boneMatricesBuffer; },
    get avatarVB() { return avatarVB; },
    get avatarIB() { return avatarIB; },
    get avatarIndexCount() { return avatarIndexCount; },
    get avatarLoaded() { return avatarLoaded; },
    get avatarTexture() { return avatarTexture; },
    get avatarSampler() { return avatarSampler; },
    get MAX_BONES() { return MAX_BONES; },
    get skeleton() { return avatarSkeleton; },
    get animations() { return avatarAnimations; },

    ensureBoneMatricesBuffer,
    updateAnimation,
  };
}
