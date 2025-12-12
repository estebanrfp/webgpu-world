/**
 * Compute Shaders - WGSL compute shaders for GPU physics
 * Part of TypeGPU-Project-World modular shader system
 */

/**
 * Terrain Height Compute Shader
 * Calculates terrain height on GPU for physics synchronization
 * Uses identical algorithm as terrain shader for perfect match
 */
export const terrainHeightComputeShader = `
  struct Input {
    posX: f32,
    posZ: f32,
  }
  
  struct Output {
    height: f32,
  }
  
  @group(0) @binding(0) var<uniform> input: Input;
  @group(0) @binding(1) var<storage, read_write> output: Output;
  
  // Same hash function as terrain shader - integer based for exact match
  fn hash(x: f32, y: f32) -> f32 {
    var ix = i32(floor(x)) % 256;
    var iy = i32(floor(y)) % 256;
    if (ix < 0) { ix += 256; }
    if (iy < 0) { iy += 256; }
    let n = (ix * 73 + iy * 179) % 256;
    return f32(n) / 255.0;
  }
  
  fn smoothNoise(x: f32, y: f32) -> f32 {
    let ix = floor(x);
    let iy = floor(y);
    let fx = x - ix;
    let fy = y - iy;
    let ux = fx * fx * (3.0 - 2.0 * fx);
    let uy = fy * fy * (3.0 - 2.0 * fy);
    let a = hash(ix, iy);
    let b = hash(ix + 1.0, iy);
    let c = hash(ix, iy + 1.0);
    let d = hash(ix + 1.0, iy + 1.0);
    return mix(mix(a, b, ux), mix(c, d, ux), uy);
  }
  
  fn getHeight(worldX: f32, worldZ: f32) -> f32 {
    let scale = 0.002;
    let px = worldX * scale;
    let py = worldZ * scale;
    
    var h = 0.0;
    h += smoothNoise(px, py) * 1.0;
    h += smoothNoise(px * 2.0, py * 2.0) * 0.5;
    h += smoothNoise(px * 4.0, py * 4.0) * 0.25;
    h += smoothNoise(px * 8.0, py * 8.0) * 0.125;
    h = h / 1.875;
    
    let islandThreshold = 0.45;
    
    if (h < islandThreshold) {
      h = -0.1;
    } else {
      let normalized = (h - islandThreshold) / (1.0 - islandThreshold);
      h = pow(normalized, 0.7);
      h += smoothNoise(px * 16.0, py * 16.0) * 0.05 * normalized;
    }
    
    return h * 80.0 - 8.0;
  }
  
  @compute @workgroup_size(1)
  fn main() {
    output.height = getHeight(input.posX, input.posZ);
  }
`;
