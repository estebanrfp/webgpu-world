/**
 * ========================================
 * WebGPU/TypeGPU Initialization
 * ========================================
 * Initializes WebGPU device and TypeGPU root
 */

import tgpu from 'typegpu';
import * as d from 'typegpu/data';

// ============================================
// TypeGPU Uniform Schemas
// ============================================

export const CameraUniforms = d.struct({
  viewProjection: d.mat4x4f,
  position: d.vec3f,
  time: d.f32,
  cloudCoverage: d.f32,  // 0.0 = clear, 1.0 = full clouds
  starBlur: d.f32,       // Star blur amount (1.0 = sharp, 5.0 = very soft)
  skyDarkening: d.f32,   // Weather-based sky darkening (0.0 = normal, 1.0 = very dark)
  lightningFlash: d.f32, // Lightning flash intensity
  lightningPosX: d.f32,  // Lightning direction X (normalized)
  lightningPosY: d.f32,  // Lightning direction Y (height in sky)
});

export const TerrainUniforms = d.struct({
  modelMatrix: d.mat4x4f,
  color: d.vec3f,
  scale: d.f32,
});

export const OceanUniforms = d.struct({
  modelMatrix: d.mat4x4f,
  // Colors
  deepColor: d.vec3f,
  waterLevel: d.f32,
  shallowColor: d.vec3f,
  time: d.f32,
  underwaterTint: d.vec3f,
  deepDepth: d.f32,
  skyReflection: d.vec3f,
  shallowDepth: d.f32,
  foamColor: d.vec3f,
  veryShallowDepth: d.f32,
  sunColor: d.vec3f,
  foamDepthMax: d.f32,
  sssColor: d.vec3f,
  sssStrength: d.f32,
  causticsColor: d.vec3f,
  causticsIntensity: d.f32,
  // Transparency
  baseAlphaMin: d.f32,
  baseAlphaMax: d.f32,
  depthAlphaRange: d.f32,
  shallowAlphaBoost: d.f32,
  // Distortion
  distortionStrength: d.f32,
  distortionScale: d.f32,
  distortionSpeed: d.f32,
  distortionWorldScale: d.f32,
  // Caustics
  causticsScale: d.f32,
  causticsSpeed: d.f32,
  // Fresnel
  fresnelF0: d.f32,
  fresnelPower: d.f32,
  // Lighting
  sunDir: d.vec3f,
  skyReflectionStr: d.f32,
  ambientLight: d.f32,
  diffuseLight: d.f32,
  lightBoost: d.f32,
  foamLightBoost: d.f32,
  // Specular
  specPower: d.f32,
  specStrength: d.f32,
  sparklePower: d.f32,
  sparkleStrength: d.f32,
  // Foam
  foamThreshold: d.f32,
  foamEdgeStart: d.f32,
  foamBandThreshold: d.f32,
  foamEdgeStrength: d.f32,
  foamBandStrength: d.f32,
  foamAlphaBlend: d.f32,
  // SSS
  sssShallowBoost: d.f32,
  sssPower: d.f32,
  // Underwater tint
  underwaterTintStr: d.f32,
  _pad: d.f32,
  // Avatar reflection
  avatarPos: d.vec3f,
  avatarHeight: d.f32,
});

export const CharacterUniforms = d.struct({
  modelMatrix: d.mat4x4f,
  color: d.vec3f,
  pad: d.f32,
});

// Underwater effect uniforms - aligned to match WGSL struct
export const UnderwaterUniforms = d.struct({
  cameraPos: d.vec3f,
  time: d.f32,
  waterLevel: d.f32,
  cameraDepth: d.f32,
  fogDensity: d.f32,
  fogStart: d.f32,
  fogEnd: d.f32,
  tintStrength: d.f32,
  godRaysIntensity: d.f32,
  godRaysSpeed: d.f32,
  godRaysDensity: d.f32,
  godRaysLength: d.f32,
  causticsIntensity: d.f32,
  causticsScale: d.f32,
  causticsSpeed: d.f32,
  surfaceWaveStrength: d.f32,
  surfaceFresnelPower: d.f32,
  bubblesEnabled: d.f32,
  bubblesCount: d.f32,
  bubblesSpeed: d.f32,
  bubblesSize: d.f32,
  depthDarkenStart: d.f32,
  depthDarkenEnd: d.f32,
  depthDarkenStrength: d.f32,
  blurRadius: d.f32,
  fogColor: d.vec3f,
  _pad1: d.f32,
  tintColor: d.vec3f,
  _pad2: d.f32,
  godRaysColor: d.vec3f,
  _pad3: d.f32,
  surfaceColor: d.vec3f,
  _pad4: d.f32,
  bubblesColor: d.vec3f,
  _pad5: d.f32,
});

// ============================================
// GPU Context
// ============================================

/**
 * @typedef {Object} GPUContext
 * @property {import('typegpu').TgpuRoot} root - TypeGPU root
 * @property {GPUDevice} device - WebGPU device
 * @property {GPUCanvasContext} context - Canvas context
 * @property {GPUTextureFormat} format - Preferred canvas format
 * @property {HTMLCanvasElement} canvas - Canvas element
 */

/**
 * Initialize WebGPU and TypeGPU
 * @param {HTMLCanvasElement} canvas 
 * @returns {Promise<GPUContext>}
 */
export async function initGPU(canvas) {
  if (!navigator.gpu) {
    throw new Error('WebGPU not supported. Please use Chrome 113+ or Edge 113+');
  }

  // Setup canvas size
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;

  // Let TypeGPU create and manage the device
  const root = await tgpu.init({
    adapter: {
      powerPreference: 'high-performance',
    }
  });

  // Get the device from TypeGPU's root
  const device = root.device;

  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  return { root, device, context, format, canvas };
}

/**
 * Create uniform buffers
 * @param {import('typegpu').TgpuRoot} root 
 * @returns {Object} Uniform buffers
 */
export function createUniformBuffers(root) {
  return {
    camera: root.createBuffer(CameraUniforms).$usage('uniform'),
    terrain: root.createBuffer(TerrainUniforms).$usage('uniform'),
    ocean: root.createBuffer(OceanUniforms).$usage('uniform'),
    character: root.createBuffer(CharacterUniforms).$usage('uniform'),
    underwater: root.createBuffer(UnderwaterUniforms).$usage('uniform'),
  };
}

// Re-export typegpu data module for convenience
export { d };
