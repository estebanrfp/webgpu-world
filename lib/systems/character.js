/**
 * Character System - Avatar loading, animations, and rendering
 *
 * The avatar is a VOXEL mesh built at runtime from compact parameters and rigged to the local
 * Mixamo skeleton (avatar-rig.glb), animated by the shared clips (avatar-anims.glb). This replaces
 * the retired Ready Player Me dependency — no external avatar service, no network model fetch.
 * Voxel pipeline ported from OVGrid (lib/avatar/voxel-builder.js).
 */

import {
  CONFIG,
  loadGLB,
  extractSkeleton,
  extractAnimations,
  AnimationSystem,
  buildVoxelAvatar,
  DEFAULT_VOXEL_PARAMS,
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

  // Build the voxel avatar asynchronously (rig + animations are local GLB assets).
  (async () => {
    try {
      console.log('Loading avatar rig (skeleton)...');
      const rigGlb = await loadGLB(CONFIG.assets.rig);
      const skeleton = extractSkeleton(rigGlb.json, rigGlb.bin);
      if (!skeleton) throw new Error('avatar-rig.glb has no skeleton');

      console.log('Loading animations...');
      const animGlb = await loadGLB(CONFIG.assets.animations);
      const animations = extractAnimations(animGlb.json, animGlb.bin);
      const animSkeleton = extractSkeleton(animGlb.json, animGlb.bin);

      // Retarget animation tracks onto the rig skeleton's bone names (normalised match), so the
      // clips drive the rig the voxel mesh is bound to.
      let retargetedAnims = animations;
      if (animSkeleton) {
        const boneMapping = {};
        for (const animBone of animSkeleton.joints) {
          if (skeleton.joints.includes(animBone)) { boneMapping[animBone] = animBone; continue; }
          const an = animBone.toLowerCase().replace(/[_.\s]/g, '');
          for (const rigBone of skeleton.joints) {
            const rn = rigBone.toLowerCase().replace(/[_.\s]/g, '');
            if (an === rn || an.includes(rn) || rn.includes(an)) { boneMapping[animBone] = rigBone; break; }
          }
        }
        retargetedAnims = {};
        for (const [name, anim] of Object.entries(animations)) {
          retargetedAnims[name] = {
            ...anim,
            tracks: anim.tracks.map(t => ({ ...t, nodeName: boneMapping[t.nodeName] || t.nodeName })),
          };
        }
      }

      // Store skeleton and animations for NPC reuse
      avatarSkeleton = skeleton;
      avatarAnimations = retargetedAnims;
      animationSystem = new AnimationSystem(skeleton, retargetedAnims);

      if (!boneMatricesBuffer) {
        boneMatricesBuffer = device.createBuffer({
          size: MAX_BONES * 16 * 4,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
      }

      const firstAnim = retargetedAnims['Idle'] ? 'Idle' : Object.keys(retargetedAnims)[0];
      if (firstAnim) animationSystem.play(firstAnim);
      console.log('✅ Animation system initialized!');

      // Build the voxel mesh, rigged to the rig skeleton — its joint indices line up with the
      // bone matrices the AnimationSystem outputs, so it deforms correctly.
      const mesh = buildVoxelAvatar(DEFAULT_VOXEL_PARAMS, skeleton);

      avatarVB = device.createBuffer({
        size: mesh.vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(avatarVB, 0, mesh.vertices);

      avatarIB = device.createBuffer({
        size: mesh.indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(avatarIB, 0, mesh.indices);
      avatarIndexCount = mesh.indices.length;

      // Voxel avatars are textureless (per-vertex flat colours). Keep a 1×1 white texture so the
      // existing bind group/layout (binding 2/3) stays valid — the shader multiplies by it (= 1).
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
      avatarSampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });

      avatarLoaded = true;
      console.log(`✅ Voxel avatar built! ${avatarIndexCount} indices, ${skeleton.joints.length} bones`);
    } catch (e) {
      console.error('Failed to build avatar:', e);
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
      targetAnim = isMoving ? 'Swim' : 'TreadWater';   // swim when moving, tread water when still
    } else if (isFlying) {
      targetAnim = 'Floating';
    } else if (isFalling) {
      targetAnim = 'Fall';
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
