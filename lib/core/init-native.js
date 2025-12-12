/**
 * ========================================
 * WebGPU Native Initialization
 * ========================================
 * Pure WebGPU initialization without TypeGPU
 */

import {
  CAMERA_UNIFORMS_SIZE,
  TERRAIN_UNIFORMS_SIZE,
  OCEAN_UNIFORMS_SIZE,
  CHARACTER_UNIFORMS_SIZE,
  UNDERWATER_UNIFORMS_SIZE,
  createUniformBuffer,
} from './uniforms.js';

// ============================================
// GPU Context
// ============================================

/**
 * @typedef {Object} GPUContext
 * @property {GPUDevice} device - WebGPU device
 * @property {GPUCanvasContext} context - Canvas context
 * @property {GPUTextureFormat} format - Preferred canvas format
 * @property {HTMLCanvasElement} canvas - Canvas element
 * @property {GPUAdapter} adapter - GPU adapter
 */

/**
 * Initialize WebGPU (Native)
 * @param {HTMLCanvasElement} canvas 
 * @returns {Promise<GPUContext>}
 */
export async function initGPU(canvas) {
  if (!navigator.gpu) {
    throw new Error('WebGPU not supported. Please use Chrome 113+ or Edge 113+');
  }

  // Request adapter
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });

  if (!adapter) {
    throw new Error('No WebGPU adapter found');
  }

  // Request device
  const device = await adapter.requestDevice({
    requiredFeatures: [],
    requiredLimits: {},
  });

  // Handle device loss
  device.lost.then((info) => {
    console.error('WebGPU device was lost:', info.message);
    if (info.reason !== 'destroyed') {
      // Try to recover
      console.log('Attempting to recover...');
    }
  });

  // Setup canvas size
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;

  // Configure canvas context
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ 
    device, 
    format, 
    alphaMode: 'premultiplied' 
  });

  return { device, context, format, canvas, adapter };
}

/**
 * Create uniform buffers (native WebGPU)
 * @param {GPUDevice} device 
 * @returns {Object} Uniform buffers
 */
export function createUniformBuffers(device) {
  return {
    camera: createUniformBuffer(device, CAMERA_UNIFORMS_SIZE),
    terrain: createUniformBuffer(device, TERRAIN_UNIFORMS_SIZE),
    ocean: createUniformBuffer(device, OCEAN_UNIFORMS_SIZE),
    character: createUniformBuffer(device, CHARACTER_UNIFORMS_SIZE),
    underwater: createUniformBuffer(device, UNDERWATER_UNIFORMS_SIZE),
  };
}

// Re-export uniform helpers for convenience
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
