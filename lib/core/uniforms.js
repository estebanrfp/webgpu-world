/**
 * ========================================
 * WebGPU Uniform Buffer Helpers
 * ========================================
 * Native WebGPU uniform buffer management
 * Replaces TypeGPU's typed buffer system
 */

// ============================================
// Uniform Structure Sizes (bytes, 16-byte aligned)
// ============================================

// CameraUniforms: mat4 (64) + vec3 (12) + f32 (4) + 6*f32 (24) = 104 → aligned to 112
export const CAMERA_UNIFORMS_SIZE = 112;

// TerrainUniforms: mat4 (64) + vec3 (12) + f32 (4) = 80
export const TERRAIN_UNIFORMS_SIZE = 80;

// OceanUniforms: Complex struct with many fields
// mat4 (64) + lots of vec3/f32 fields = ~368 bytes
export const OCEAN_UNIFORMS_SIZE = 384;

// CharacterUniforms: mat4 (64) + vec3 (12) + f32 (4) = 80
export const CHARACTER_UNIFORMS_SIZE = 80;

// UnderwaterUniforms: Large struct with many fields = ~256 bytes
export const UNDERWATER_UNIFORMS_SIZE = 256;

// LightUniforms: mat4 (64) + vec3 (12) + f32 (4) = 80
export const LIGHT_UNIFORMS_SIZE = 80;

// GodRaysUniforms: 6*f32 + vec2 = 32
export const GOD_RAYS_UNIFORMS_SIZE = 32;

// BubblesUniforms: 8*f32 = 32
export const BUBBLES_UNIFORMS_SIZE = 32;

// RainUniforms: 8*f32 + vec3 + f32 + f32 + vec3 = 56 → aligned to 64
export const RAIN_UNIFORMS_SIZE = 64;

// LightningUniforms: 8*f32 = 32
export const LIGHTNING_UNIFORMS_SIZE = 32;

// SnowUniforms: 8*f32 + vec3 + f32 = 48
export const SNOW_UNIFORMS_SIZE = 48;

// ============================================
// Buffer Write Helpers
// ============================================

/**
 * Write a mat4x4f to an ArrayBuffer at offset
 * @param {DataView} view - DataView of the buffer
 * @param {number} offset - Byte offset
 * @param {Float32Array|number[]} mat - 16 floats
 */
export function writeMat4(view, offset, mat) {
  for (let i = 0; i < 16; i++) {
    view.setFloat32(offset + i * 4, mat[i], true);
  }
}

/**
 * Write a vec3f to an ArrayBuffer at offset
 * @param {DataView} view - DataView of the buffer
 * @param {number} offset - Byte offset
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 */
export function writeVec3(view, offset, x, y, z) {
  view.setFloat32(offset, x, true);
  view.setFloat32(offset + 4, y, true);
  view.setFloat32(offset + 8, z, true);
}

/**
 * Write a vec3f from array to an ArrayBuffer at offset
 * @param {DataView} view - DataView of the buffer
 * @param {number} offset - Byte offset
 * @param {number[]} arr - [x, y, z]
 */
export function writeVec3Array(view, offset, arr) {
  view.setFloat32(offset, arr[0], true);
  view.setFloat32(offset + 4, arr[1], true);
  view.setFloat32(offset + 8, arr[2], true);
}

/**
 * Write a vec2f to an ArrayBuffer at offset
 * @param {DataView} view - DataView of the buffer
 * @param {number} offset - Byte offset
 * @param {number} x 
 * @param {number} y 
 */
export function writeVec2(view, offset, x, y) {
  view.setFloat32(offset, x, true);
  view.setFloat32(offset + 4, y, true);
}

/**
 * Write a f32 to an ArrayBuffer at offset
 * @param {DataView} view - DataView of the buffer
 * @param {number} offset - Byte offset
 * @param {number} value 
 */
export function writeF32(view, offset, value) {
  view.setFloat32(offset, value, true);
}

// ============================================
// Camera Buffer Writer
// ============================================

/**
 * Create camera uniform data
 * @param {Object} params
 * @param {Float32Array} params.viewProjection - 4x4 matrix
 * @param {{x: number, y: number, z: number}} params.position
 * @param {number} params.time
 * @param {number} params.cloudCoverage
 * @param {number} params.starBlur
 * @param {number} params.skyDarkening
 * @param {number} params.lightningFlash
 * @param {number} params.lightningPosX
 * @param {number} params.lightningPosY
 * @returns {ArrayBuffer}
 */
export function createCameraData(params) {
  const buffer = new ArrayBuffer(CAMERA_UNIFORMS_SIZE);
  const view = new DataView(buffer);
  
  // mat4x4f viewProjection (offset 0, size 64)
  writeMat4(view, 0, params.viewProjection);
  
  // vec3f position (offset 64, size 12)
  writeVec3(view, 64, params.position.x, params.position.y, params.position.z);
  
  // f32 time (offset 76)
  writeF32(view, 76, params.time);
  
  // f32 cloudCoverage (offset 80)
  writeF32(view, 80, params.cloudCoverage);
  
  // f32 starBlur (offset 84)
  writeF32(view, 84, params.starBlur);
  
  // f32 skyDarkening (offset 88)
  writeF32(view, 88, params.skyDarkening);
  
  // f32 lightningFlash (offset 92)
  writeF32(view, 92, params.lightningFlash);
  
  // f32 lightningPosX (offset 96)
  writeF32(view, 96, params.lightningPosX);
  
  // f32 lightningPosY (offset 100)
  writeF32(view, 100, params.lightningPosY);
  
  return buffer;
}

// ============================================
// Terrain Buffer Writer
// ============================================

/**
 * Create terrain uniform data
 * @param {Object} params
 * @param {Float32Array} params.modelMatrix - 4x4 matrix
 * @param {number[]} params.color - [r, g, b]
 * @param {number} params.scale
 * @returns {ArrayBuffer}
 */
export function createTerrainData(params) {
  const buffer = new ArrayBuffer(TERRAIN_UNIFORMS_SIZE);
  const view = new DataView(buffer);
  
  // mat4x4f modelMatrix (offset 0, size 64)
  writeMat4(view, 0, params.modelMatrix);
  
  // vec3f color (offset 64, size 12)
  writeVec3Array(view, 64, params.color);
  
  // f32 scale (offset 76)
  writeF32(view, 76, params.scale);
  
  return buffer;
}

// ============================================
// Character Buffer Writer
// ============================================

/**
 * Create character uniform data
 * @param {Object} params
 * @param {Float32Array} params.modelMatrix - 4x4 matrix
 * @param {number[]} params.color - [r, g, b]
 * @returns {ArrayBuffer}
 */
export function createCharacterData(params) {
  const buffer = new ArrayBuffer(CHARACTER_UNIFORMS_SIZE);
  const view = new DataView(buffer);
  
  // mat4x4f modelMatrix (offset 0, size 64)
  writeMat4(view, 0, params.modelMatrix);
  
  // vec3f color (offset 64, size 12)
  writeVec3Array(view, 64, params.color);
  
  // f32 pad (offset 76)
  writeF32(view, 76, 0);
  
  return buffer;
}

// ============================================
// Light Buffer Writer
// ============================================

/**
 * Create light uniform data
 * @param {Object} params
 * @param {Float32Array} params.viewProjection - 4x4 matrix
 * @param {{x: number, y: number, z: number}} params.position
 * @returns {ArrayBuffer}
 */
export function createLightData(params) {
  const buffer = new ArrayBuffer(LIGHT_UNIFORMS_SIZE);
  const view = new DataView(buffer);
  
  // mat4x4f viewProjection (offset 0, size 64)
  writeMat4(view, 0, params.viewProjection);
  
  // vec3f position (offset 64, size 12)
  writeVec3(view, 64, params.position.x, params.position.y, params.position.z);
  
  // f32 pad (offset 76)
  writeF32(view, 76, 0);
  
  return buffer;
}

// ============================================
// Ocean Buffer Writer
// ============================================

/**
 * Create ocean uniform data
 * @param {Object} params - All ocean parameters
 * @returns {ArrayBuffer}
 */
export function createOceanData(params) {
  const buffer = new ArrayBuffer(OCEAN_UNIFORMS_SIZE);
  const view = new DataView(buffer);
  let offset = 0;
  
  // mat4x4f modelMatrix (64 bytes)
  writeMat4(view, offset, params.modelMatrix); offset += 64;
  
  // vec3f deepColor + f32 waterLevel (16 bytes)
  writeVec3Array(view, offset, params.deepColor); offset += 12;
  writeF32(view, offset, params.waterLevel); offset += 4;
  
  // vec3f shallowColor + f32 time (16 bytes)
  writeVec3Array(view, offset, params.shallowColor); offset += 12;
  writeF32(view, offset, params.time); offset += 4;
  
  // vec3f underwaterTint + f32 deepDepth (16 bytes)
  writeVec3Array(view, offset, params.underwaterTint); offset += 12;
  writeF32(view, offset, params.deepDepth); offset += 4;
  
  // vec3f skyReflection + f32 shallowDepth (16 bytes)
  writeVec3Array(view, offset, params.skyReflection); offset += 12;
  writeF32(view, offset, params.shallowDepth); offset += 4;
  
  // vec3f foamColor + f32 veryShallowDepth (16 bytes)
  writeVec3Array(view, offset, params.foamColor); offset += 12;
  writeF32(view, offset, params.veryShallowDepth); offset += 4;
  
  // vec3f sunColor + f32 foamDepthMax (16 bytes)
  writeVec3Array(view, offset, params.sunColor); offset += 12;
  writeF32(view, offset, params.foamDepthMax); offset += 4;
  
  // vec3f sssColor + f32 sssStrength (16 bytes)
  writeVec3Array(view, offset, params.sssColor); offset += 12;
  writeF32(view, offset, params.sssStrength); offset += 4;
  
  // vec3f causticsColor + f32 causticsIntensity (16 bytes)
  writeVec3Array(view, offset, params.causticsColor); offset += 12;
  writeF32(view, offset, params.causticsIntensity); offset += 4;
  
  // 4x f32: baseAlphaMin, baseAlphaMax, depthAlphaRange, shallowAlphaBoost (16 bytes)
  writeF32(view, offset, params.baseAlphaMin); offset += 4;
  writeF32(view, offset, params.baseAlphaMax); offset += 4;
  writeF32(view, offset, params.depthAlphaRange); offset += 4;
  writeF32(view, offset, params.shallowAlphaBoost); offset += 4;
  
  // 4x f32: distortion params (16 bytes)
  writeF32(view, offset, params.distortionStrength); offset += 4;
  writeF32(view, offset, params.distortionScale); offset += 4;
  writeF32(view, offset, params.distortionSpeed); offset += 4;
  writeF32(view, offset, params.distortionWorldScale); offset += 4;
  
  // 2x f32: causticsScale, causticsSpeed + 2x f32: fresnel (16 bytes)
  writeF32(view, offset, params.causticsScale); offset += 4;
  writeF32(view, offset, params.causticsSpeed); offset += 4;
  writeF32(view, offset, params.fresnelF0); offset += 4;
  writeF32(view, offset, params.fresnelPower); offset += 4;
  
  // vec3f sunDir + f32 skyReflectionStr (16 bytes)
  writeVec3Array(view, offset, params.sunDir); offset += 12;
  writeF32(view, offset, params.skyReflectionStr); offset += 4;
  
  // 4x f32: lighting (16 bytes)
  writeF32(view, offset, params.ambientLight); offset += 4;
  writeF32(view, offset, params.diffuseLight); offset += 4;
  writeF32(view, offset, params.lightBoost); offset += 4;
  writeF32(view, offset, params.foamLightBoost); offset += 4;
  
  // 4x f32: specular (16 bytes)
  writeF32(view, offset, params.specPower); offset += 4;
  writeF32(view, offset, params.specStrength); offset += 4;
  writeF32(view, offset, params.sparklePower); offset += 4;
  writeF32(view, offset, params.sparkleStrength); offset += 4;
  
  // 4x f32: foam params (16 bytes)
  writeF32(view, offset, params.foamThreshold); offset += 4;
  writeF32(view, offset, params.foamEdgeStart); offset += 4;
  writeF32(view, offset, params.foamBandThreshold); offset += 4;
  writeF32(view, offset, params.foamEdgeStrength); offset += 4;
  
  // 2x f32: foamBandStrength, foamAlphaBlend + 2x f32: sss (16 bytes)
  writeF32(view, offset, params.foamBandStrength); offset += 4;
  writeF32(view, offset, params.foamAlphaBlend); offset += 4;
  writeF32(view, offset, params.sssShallowBoost); offset += 4;
  writeF32(view, offset, params.sssPower); offset += 4;
  
  // f32 underwaterTintStr + f32 _pad + vec3f avatarPos (aligned to 16)
  writeF32(view, offset, params.underwaterTintStr); offset += 4;
  writeF32(view, offset, 0); offset += 4; // _pad
  // Need alignment for vec3f - skip to next 16-byte boundary
  offset = Math.ceil(offset / 16) * 16;
  
  // vec3f avatarPos + f32 avatarHeight (16 bytes)
  writeVec3(view, offset, params.avatarPos.x, params.avatarPos.y, params.avatarPos.z); offset += 12;
  writeF32(view, offset, params.avatarHeight); offset += 4;
  
  return buffer;
}

// ============================================
// Underwater Buffer Writer
// ============================================

/**
 * Create underwater uniform data
 * @param {Object} params - Underwater parameters
 * @returns {ArrayBuffer}
 */
export function createUnderwaterData(params) {
  const buffer = new ArrayBuffer(UNDERWATER_UNIFORMS_SIZE);
  const view = new DataView(buffer);
  let offset = 0;
  
  // vec3f cameraPos + f32 time (16 bytes)
  writeVec3(view, offset, params.cameraPos.x, params.cameraPos.y, params.cameraPos.z); offset += 12;
  writeF32(view, offset, params.time); offset += 4;
  
  // f32 waterLevel, cameraDepth, fogDensity, fogStart (16 bytes)
  writeF32(view, offset, params.waterLevel); offset += 4;
  writeF32(view, offset, params.cameraDepth); offset += 4;
  writeF32(view, offset, params.fogDensity); offset += 4;
  writeF32(view, offset, params.fogStart); offset += 4;
  
  // f32 fogEnd, tintStrength, godRaysIntensity, godRaysSpeed (16 bytes)
  writeF32(view, offset, params.fogEnd); offset += 4;
  writeF32(view, offset, params.tintStrength); offset += 4;
  writeF32(view, offset, params.godRaysIntensity); offset += 4;
  writeF32(view, offset, params.godRaysSpeed); offset += 4;
  
  // f32 godRaysDensity, godRaysLength, causticsIntensity, causticsScale (16 bytes)
  writeF32(view, offset, params.godRaysDensity); offset += 4;
  writeF32(view, offset, params.godRaysLength); offset += 4;
  writeF32(view, offset, params.causticsIntensity); offset += 4;
  writeF32(view, offset, params.causticsScale); offset += 4;
  
  // f32 causticsSpeed, surfaceWaveStrength, surfaceFresnelPower, bubblesEnabled (16 bytes)
  writeF32(view, offset, params.causticsSpeed); offset += 4;
  writeF32(view, offset, params.surfaceWaveStrength); offset += 4;
  writeF32(view, offset, params.surfaceFresnelPower); offset += 4;
  writeF32(view, offset, params.bubblesEnabled); offset += 4;
  
  // f32 bubblesCount, bubblesSpeed, bubblesSize, depthDarkenStart (16 bytes)
  writeF32(view, offset, params.bubblesCount); offset += 4;
  writeF32(view, offset, params.bubblesSpeed); offset += 4;
  writeF32(view, offset, params.bubblesSize); offset += 4;
  writeF32(view, offset, params.depthDarkenStart); offset += 4;
  
  // f32 depthDarkenEnd, depthDarkenStrength, blurRadius, _pad (16 bytes)
  writeF32(view, offset, params.depthDarkenEnd); offset += 4;
  writeF32(view, offset, params.depthDarkenStrength); offset += 4;
  writeF32(view, offset, params.blurRadius); offset += 4;
  writeF32(view, offset, 0); offset += 4; // padding
  
  // vec3f fogColor + _pad1 (16 bytes)
  writeVec3Array(view, offset, params.fogColor); offset += 12;
  writeF32(view, offset, 0); offset += 4;
  
  // vec3f tintColor + _pad2 (16 bytes)
  writeVec3Array(view, offset, params.tintColor); offset += 12;
  writeF32(view, offset, 0); offset += 4;
  
  // vec3f godRaysColor + _pad3 (16 bytes)
  writeVec3Array(view, offset, params.godRaysColor); offset += 12;
  writeF32(view, offset, 0); offset += 4;
  
  // vec3f surfaceColor + _pad4 (16 bytes)
  writeVec3Array(view, offset, params.surfaceColor); offset += 12;
  writeF32(view, offset, 0); offset += 4;
  
  // vec3f bubblesColor + _pad5 (16 bytes)
  writeVec3Array(view, offset, params.bubblesColor); offset += 12;
  writeF32(view, offset, 0); offset += 4;
  
  return buffer;
}

// ============================================
// Weather Effect Buffer Writers
// ============================================

/**
 * Create god rays uniform data
 */
export function createGodRaysData(params) {
  const buffer = new ArrayBuffer(GOD_RAYS_UNIFORMS_SIZE);
  const view = new DataView(buffer);
  
  writeF32(view, 0, params.waterLevel);
  writeF32(view, 4, params.intensity);
  writeF32(view, 8, params.numRays);
  writeF32(view, 12, params.rayWidth);
  writeF32(view, 16, params.rayLength);
  writeF32(view, 20, params.speed);
  writeVec2(view, 24, 0, 0); // _pad
  
  return buffer;
}

/**
 * Create bubbles uniform data
 */
export function createBubblesData(params) {
  const buffer = new ArrayBuffer(BUBBLES_UNIFORMS_SIZE);
  const view = new DataView(buffer);
  
  writeF32(view, 0, params.waterLevel);
  writeF32(view, 4, params.numBubbles);
  writeF32(view, 8, params.minSize);
  writeF32(view, 12, params.maxSize);
  writeF32(view, 16, params.riseSpeed);
  writeF32(view, 20, params.wobbleSpeed);
  writeF32(view, 24, params.wobbleAmount);
  writeF32(view, 28, params.spawnRadius);
  
  return buffer;
}

/**
 * Create rain uniform data
 */
export function createRainData(params) {
  const buffer = new ArrayBuffer(RAIN_UNIFORMS_SIZE);
  const view = new DataView(buffer);
  let offset = 0;
  
  writeF32(view, offset, params.numParticles); offset += 4;
  writeF32(view, offset, params.speed); offset += 4;
  writeF32(view, offset, params.length); offset += 4;
  writeF32(view, offset, params.width); offset += 4;
  writeF32(view, offset, params.windStrength); offset += 4;
  writeF32(view, offset, params.spawnRadius); offset += 4;
  writeF32(view, offset, params.spawnHeight); offset += 4;
  writeF32(view, offset, params.intensity); offset += 4;
  writeVec3Array(view, offset, params.color); offset += 12;
  writeF32(view, offset, params.opacity); offset += 4;
  writeF32(view, offset, params.lightningFlash); offset += 4;
  writeVec3(view, offset, 0, 0, 0); // _pad
  
  return buffer;
}

/**
 * Create lightning uniform data
 */
export function createLightningData(params) {
  const buffer = new ArrayBuffer(LIGHTNING_UNIFORMS_SIZE);
  const view = new DataView(buffer);
  
  writeF32(view, 0, params.isActive);
  writeF32(view, 4, params.startTime);
  writeF32(view, 8, params.boltDuration);
  writeF32(view, 12, params.flashIntensity);
  writeF32(view, 16, params.startX);
  writeF32(view, 20, params.startZ);
  writeF32(view, 24, params.seed);
  writeF32(view, 28, params.numBranches);
  
  return buffer;
}

/**
 * Create snow uniform data
 */
export function createSnowData(params) {
  const buffer = new ArrayBuffer(SNOW_UNIFORMS_SIZE);
  const view = new DataView(buffer);
  let offset = 0;
  
  writeF32(view, offset, params.numParticles); offset += 4;
  writeF32(view, offset, params.speed); offset += 4;
  writeF32(view, offset, params.wobbleSpeed); offset += 4;
  writeF32(view, offset, params.wobbleAmount); offset += 4;
  writeF32(view, offset, params.minSize); offset += 4;
  writeF32(view, offset, params.maxSize); offset += 4;
  writeF32(view, offset, params.spawnRadius); offset += 4;
  writeF32(view, offset, params.spawnHeight); offset += 4;
  writeVec3Array(view, offset, params.color); offset += 12;
  writeF32(view, offset, params.opacity);
  
  return buffer;
}

// ============================================
// Buffer Creation Helpers
// ============================================

/**
 * Create a uniform buffer
 * @param {GPUDevice} device
 * @param {number} size - Buffer size in bytes
 * @returns {GPUBuffer}
 */
export function createUniformBuffer(device, size) {
  return device.createBuffer({
    size,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

/**
 * Create all standard uniform buffers
 * @param {GPUDevice} device
 * @returns {Object} Named buffers
 */
export function createAllUniformBuffers(device) {
  return {
    camera: createUniformBuffer(device, CAMERA_UNIFORMS_SIZE),
    terrain: createUniformBuffer(device, TERRAIN_UNIFORMS_SIZE),
    ocean: createUniformBuffer(device, OCEAN_UNIFORMS_SIZE),
    character: createUniformBuffer(device, CHARACTER_UNIFORMS_SIZE),
    underwater: createUniformBuffer(device, UNDERWATER_UNIFORMS_SIZE),
    light: createUniformBuffer(device, LIGHT_UNIFORMS_SIZE),
    godRays: createUniformBuffer(device, GOD_RAYS_UNIFORMS_SIZE),
    bubbles: createUniformBuffer(device, BUBBLES_UNIFORMS_SIZE),
    rain: createUniformBuffer(device, RAIN_UNIFORMS_SIZE),
    lightning: createUniformBuffer(device, LIGHTNING_UNIFORMS_SIZE),
    snow: createUniformBuffer(device, SNOW_UNIFORMS_SIZE),
  };
}
