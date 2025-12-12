/**
 * ========================================
 * OVGrid World Library
 * ========================================
 * Main entry point for the modular world engine
 * Native WebGPU implementation
 */

// Core - Native WebGPU
export { 
  CONFIG, 
  AVATAR_URL,
  initGPU, 
  createUniformBuffers,
  // Uniform buffer sizes
  CAMERA_UNIFORMS_SIZE,
  TERRAIN_UNIFORMS_SIZE,
  OCEAN_UNIFORMS_SIZE,
  CHARACTER_UNIFORMS_SIZE,
  UNDERWATER_UNIFORMS_SIZE,
  LIGHT_UNIFORMS_SIZE,
  GOD_RAYS_UNIFORMS_SIZE,
  BUBBLES_UNIFORMS_SIZE,
  RAIN_UNIFORMS_SIZE,
  LIGHTNING_UNIFORMS_SIZE,
  SNOW_UNIFORMS_SIZE,
  // Uniform buffer creators
  createUniformBuffer,
  createAllUniformBuffers,
  createCameraData,
  createTerrainData,
  createCharacterData,
  createLightData,
  createOceanData,
  createUnderwaterData,
  createGodRaysData,
  createBubblesData,
  createRainData,
  createLightningData,
  createSnowData,
  // Low-level writers
  writeMat4,
  writeVec3,
  writeVec3Array,
  writeVec2,
  writeF32,
} from './core/index.js';

// Textures
export { 
  loadTexture, 
  loadKTX2Texture, 
  loadImageTexture,
  createSampler,
  isKTX2,
  initBasisTranscoder,
  createGrassTexture,
  createSandTexture,
  createRockTexture,
  createSnowTexture,
  createFlatNormalTexture
} from './textures/index.js';

// Avatar / GLB
export {
  loadGLB,
  loadTextureFromGLB,
  extractMeshData,
  extractSkeleton,
  extractSkinningData,
  extractAnimations,
  createCharacterBuffers,
  quatSlerp,
  vec3Lerp,
  trsToMatrix,
  mat4Multiply,
  AnimationSystem
} from './avatar/index.js';

// Shaders
export {
  skyShader,
  oceanShader,
  shadowTerrainShader,
  shadowCharacterShader,
  terrainShader,
  characterShader,
  underwaterShader,
  godRaysShader,
  bubblesShader,
  rainShader,
  lightningShader,
  snowShader,
  terrainHeightComputeShader
} from './shaders/index.js';

// Geometry
export {
  createPlaneGeometry,
  createGeometryBuffers,
  createTerrainGeometry,
  createOceanGeometry
} from './geometry.js';

// Math utilities
export {
  perspective,
  normalize3,
  cross,
  dot,
  lookAt,
  mul,
  identity,
  rotateX,
  rotateY,
  rotateZ,
  translate,
  scale,
  scale3,
  invert,
  lerp,
  clamp,
  degToRad,
  radToDeg
} from './math.js';

// Lighting / Day-Night Cycle
export {
  getLightDirection,
  getDayFactor,
  getFormattedTime,
  calculateLightPosition,
  createOrthographicProjection
} from './lighting.js';
