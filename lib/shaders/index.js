/**
 * Shaders Module - WGSL shader exports for TypeGPU-Project-World
 * 
 * This module provides all WGSL shaders as ES module exports.
 * Each shader is a template literal string containing WGSL code.
 * 
 * Shader categories:
 * - Sky: Complete procedural sky system (day/night, clouds, stars, aurora)
 * - Ocean: Realistic water rendering (waves, foam, reflections, underwater)
 * - Shadow: Shadow map generation for terrain and characters
 * - Terrain: Procedural terrain with biomes, caustics, bump mapping
 * - Character: Skinned character rendering with shadows
 * - Effects: Underwater, god rays, bubbles, rain, lightning, snow
 * - Compute: GPU compute shaders for physics (terrain height)
 */

// Sky shader - Complete procedural sky system
export { skyShader } from './sky.wgsl.js';

// Ocean shader - Realistic water rendering
export { oceanShader } from './oceanShader.wgsl.js';

// Shadow shaders - Shadow map generation
export { shadowTerrainShader, shadowCharacterShader } from './shadow.wgsl.js';

// Terrain shader - Procedural terrain rendering
export { terrainShader } from './terrain.wgsl.js';

// Character shader - Skinned character with shadows
export { characterShader } from './character.wgsl.js';

// Effects shaders - Visual effects
export {
  underwaterShader,
  godRaysShader,
  bubblesShader,
  rainShader,
  lightningShader,
  snowShader
} from './effects.wgsl.js';

// Compute shaders - GPU physics calculations
export { terrainHeightComputeShader } from './compute.wgsl.js';
