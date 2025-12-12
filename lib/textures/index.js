/**
 * ========================================
 * Texture Loaders Index
 * ========================================
 * Unified texture loading API
 */

import { loadKTX2Texture, isKTX2, initBasisTranscoder } from './ktx2-loader.js';
import { loadImageTexture } from './image-loader.js';
import { 
  createGrassTexture, 
  createSandTexture, 
  createRockTexture, 
  createSnowTexture,
  createFlatNormalTexture 
} from './procedural.js';

export { 
  isKTX2, 
  initBasisTranscoder, 
  loadKTX2Texture, 
  loadImageTexture,
  createGrassTexture,
  createSandTexture,
  createRockTexture,
  createSnowTexture,
  createFlatNormalTexture
};

/**
 * Load texture from URL (auto-detects format)
 * @param {GPUDevice} device 
 * @param {string} url 
 * @returns {Promise<GPUTexture>}
 */
export async function loadTexture(device, url) {
  if (isKTX2(url)) {
    return loadKTX2Texture(device, url);
  }
  return loadImageTexture(device, url);
}

/**
 * Create a sampler with default settings
 * @param {GPUDevice} device 
 * @param {Object} options 
 * @returns {GPUSampler}
 */
export function createSampler(device, options = {}) {
  return device.createSampler({
    magFilter: options.magFilter || 'linear',
    minFilter: options.minFilter || 'linear',
    mipmapFilter: options.mipmapFilter || 'linear',
    addressModeU: options.addressModeU || 'repeat',
    addressModeV: options.addressModeV || 'repeat',
    maxAnisotropy: options.maxAnisotropy || 16,
  });
}
