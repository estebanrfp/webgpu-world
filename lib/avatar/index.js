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
