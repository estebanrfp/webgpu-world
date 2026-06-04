/**
 * ========================================
 * Avatar Module Index
 * ========================================
 * GLB loading and animation system exports
 */

export {
  loadGLB,
  loadTextureFromGLB,
  extractMeshData,
  extractSkeleton,
  extractSkinningData,
  extractAnimations,
  createCharacterBuffers,
  quatMultiply,
  quatSlerp,
  vec3Lerp,
  trsToMatrix,
  mat4Multiply
} from './glb-loader.js';

export { AnimationSystem } from './animation-system.js';

// Voxel avatars (ported from OVGrid) — build a skinned voxel mesh from compact params,
// rigged to the Mixamo skeleton. Replaces the retired Ready Player Me dependency.
export { buildVoxelAvatar, DEFAULT_VOXEL_PARAMS, randomVoxelParams, VOXEL_FLOATS_PER_VERTEX } from './voxel-builder.js';
