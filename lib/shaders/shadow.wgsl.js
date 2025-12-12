/**
 * Shadow Shaders - WGSL shaders for shadow map generation
 * Part of TypeGPU-Project-World modular shader system
 */

/**
 * Shadow shader for terrain - renders terrain to shadow map
 * Uses the same height function as the main terrain shader
 */
export const shadowTerrainShader = `
  struct Light { viewProjection: mat4x4f, position: vec3f, pad: f32 }
  @group(0) @binding(0) var<uniform> light: Light;

  struct VSIn { @location(0) pos: vec3f, @location(1) uv: vec2f }
  struct VSOut { @builtin(position) pos: vec4f }

  // Same hash function as terrain shader
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

  @vertex fn vs(in: VSIn) -> VSOut {
    var o: VSOut;
    
    let gridSize = 15.625;
    let snappedX = floor(light.position.x / gridSize) * gridSize;
    let snappedZ = floor(light.position.z / gridSize) * gridSize;
    
    let worldX = in.pos.x + snappedX;
    let worldZ = in.pos.z + snappedZ;
    let h = getHeight(worldX, worldZ);
    
    let worldPos = vec3f(worldX, h, worldZ);
    o.pos = light.viewProjection * vec4f(worldPos, 1.0);
    return o;
  }

  @fragment fn fs() -> @location(0) vec4f {
    return vec4f(1.0);
  }
`;

/**
 * Shadow shader for character - renders skinned character to shadow map
 * Applies skeletal animation before shadow projection
 */
export const shadowCharacterShader = `
  struct Light { viewProjection: mat4x4f, position: vec3f, pad: f32 }
  struct Character { model: mat4x4f, color: vec3f, pad: f32 }
  @group(0) @binding(0) var<uniform> light: Light;
  @group(0) @binding(1) var<uniform> character: Character;
  @group(0) @binding(2) var<storage, read> boneMatrices: array<mat4x4f>;

  struct VSIn { 
    @location(0) pos: vec3f, 
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
    @location(3) joints: vec4f,
    @location(4) weights: vec4f
  }
  struct VSOut { @builtin(position) pos: vec4f }

  @vertex fn vs(in: VSIn) -> VSOut {
    var o: VSOut;
    
    // Apply skeletal animation (skinning)
    var skinnedPos = vec3f(0.0);
    let totalWeight = in.weights.x + in.weights.y + in.weights.z + in.weights.w;
    
    if (totalWeight > 0.001) {
      let bone0 = boneMatrices[u32(in.joints.x)];
      let bone1 = boneMatrices[u32(in.joints.y)];
      let bone2 = boneMatrices[u32(in.joints.z)];
      let bone3 = boneMatrices[u32(in.joints.w)];
      
      skinnedPos += (bone0 * vec4f(in.pos, 1.0)).xyz * in.weights.x;
      skinnedPos += (bone1 * vec4f(in.pos, 1.0)).xyz * in.weights.y;
      skinnedPos += (bone2 * vec4f(in.pos, 1.0)).xyz * in.weights.z;
      skinnedPos += (bone3 * vec4f(in.pos, 1.0)).xyz * in.weights.w;
    } else {
      skinnedPos = in.pos;
    }
    
    let worldPos = (character.model * vec4f(skinnedPos, 1.0)).xyz;
    o.pos = light.viewProjection * vec4f(worldPos, 1.0);
    return o;
  }

  @fragment fn fs() -> @location(0) vec4f {
    return vec4f(1.0);
  }
`;
