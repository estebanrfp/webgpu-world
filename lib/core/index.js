/**
 * ========================================
 * Core Index
 * ========================================
 * Core module exports - Native WebGPU
 */

export { CONFIG } from './config.js';

// Native WebGPU initialization
export { 
  initGPU, 
  createUniformBuffers,
} from './init-native.js';

// Uniform buffer helpers
export {
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
  writeMat4,
  writeVec3,
  writeVec3Array,
  writeVec2,
  writeF32,
} from './uniforms.js';
