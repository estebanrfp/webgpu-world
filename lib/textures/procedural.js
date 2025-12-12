/**
 * ========================================
 * Procedural Texture Generation
 * ========================================
 * Creates terrain textures procedurally using noise functions
 * Used as fallback when image textures fail to load
 */

// ============================================
// NOISE FUNCTIONS
// ============================================

/**
 * Seamless noise function - wraps at texture boundaries
 */
function seamlessNoise(x, y, size) {
  const tx = x / size;
  const ty = y / size;
  const TAU = Math.PI * 2;
  
  // 4D noise trick for seamless 2D tiling
  const nx = Math.cos(tx * TAU) * 0.5 + 0.5;
  const ny = Math.sin(tx * TAU) * 0.5 + 0.5;
  const nz = Math.cos(ty * TAU) * 0.5 + 0.5;
  const nw = Math.sin(ty * TAU) * 0.5 + 0.5;
  
  const n = Math.sin(nx * 12.9898 + ny * 78.233 + nz * 45.164 + nw * 94.673) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Simple noise for detail (non-seamless, but high frequency hides seams)
 */
function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Seamless FBM (Fractal Brownian Motion)
 */
function seamlessFBM(x, y, size, octaves = 4) {
  let value = 0, amplitude = 0.5, frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * seamlessNoise(x * frequency, y * frequency, size / frequency);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
}

/**
 * Smoothstep function for JavaScript (like GLSL/WGSL)
 */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ============================================
// TEXTURE GENERATORS
// ============================================

/**
 * Generate GRASS texture - LEAFY PATCHES pattern
 * @param {GPUDevice} device 
 * @returns {GPUTexture}
 */
export function createGrassTexture(device) {
  const size = 512;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      
      // Low frequency FBM creates soft, blobby shapes like grass clumps
      const clump1 = seamlessFBM(x * 0.8, y * 0.8, size, 4);
      const clump2 = seamlessFBM(x * 1.2 + 50, y * 1.2 + 70, size, 3);
      const clump3 = seamlessFBM(x * 0.5 + 100, y * 0.5 + 130, size, 3);
      
      // Medium sized leaf groups
      const leafGroup1 = seamlessFBM(x * 2.0 + 200, y * 2.0 + 250, size, 2);
      const leafGroup2 = seamlessFBM(x * 1.5 + 300, y * 1.5 + 350, size, 2);
      
      // Combine into soft clumpy pattern
      const clumpPattern = clump1 * 0.35 + clump2 * 0.30 + clump3 * 0.20 + 
                           leafGroup1 * 0.10 + leafGroup2 * 0.05;
      
      // Light and dark leaf groups
      const brightLeaves = smoothstep(0.55, 0.75, clump1) * smoothstep(0.45, 0.6, clump2);
      const darkGaps = smoothstep(0.45, 0.25, clump1) * smoothstep(0.5, 0.3, leafGroup1);
      
      // Variation in green tones
      const toneVar = seamlessFBM(x * 0.3 + 400, y * 0.3 + 450, size, 2);
      
      // Base green
      let r = 40 + clumpPattern * 35 + toneVar * 15;
      let g = 85 + clumpPattern * 80 + toneVar * 25;
      let b = 30 + clumpPattern * 20 + toneVar * 10;
      
      // Bright leaf highlights
      r += brightLeaves * 25;
      g += brightLeaves * 40;
      b += brightLeaves * 10;
      
      // Dark shadows in gaps
      r -= darkGaps * 20;
      g -= darkGaps * 30;
      b -= darkGaps * 8;
      
      // Occasional darker clumps
      const speciesVar = seamlessFBM(x * 0.4 + 500, y * 0.4 + 550, size, 2);
      if (speciesVar > 0.65) {
        const darker = (speciesVar - 0.65) * 2.0;
        r -= darker * 15;
        g += darker * 10;
        b += darker * 8;
      }
      
      // Occasional yellower clumps
      if (speciesVar < 0.3) {
        const yellower = (0.3 - speciesVar) * 1.5;
        r += yellower * 20;
        g += yellower * 5;
        b -= yellower * 8;
      }
      
      data[i] = Math.max(0, Math.min(255, Math.floor(r)));
      data[i + 1] = Math.max(0, Math.min(255, Math.floor(g)));
      data[i + 2] = Math.max(0, Math.min(255, Math.floor(b)));
      data[i + 3] = 255;
    }
  }

  const texture = device.createTexture({
    size: [size, size, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture }, data, { bytesPerRow: size * 4 }, [size, size, 1]);
  return texture;
}

/**
 * Generate SAND texture - visible grain and high contrast
 * @param {GPUDevice} device 
 * @returns {GPUTexture}
 */
export function createSandTexture(device) {
  const size = 512;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      
      // 4 layers of grain at different frequencies
      const grain1 = noise(x * 0.6, y * 0.6);
      const grain2 = noise(x * 1.2 + 10, y * 1.2 + 15);
      const grain3 = noise(x * 2.5 + 30, y * 2.5 + 40);
      const grain4 = noise(x * 4.5 + 60, y * 4.5 + 80);
      
      // Large variation for color patches
      const n1 = seamlessFBM(x, y, size, 3);
      const n2 = seamlessFBM(x * 2, y * 2, size, 2);
      
      // Dark grains
      const darkGrain = grain3 > 0.65 ? (grain3 - 0.65) * 3.0 : 0;
      const darkGrain2 = grain4 > 0.70 ? (grain4 - 0.70) * 2.5 : 0;
      
      // Light grains (quartz sparkles)
      const lightGrain = grain2 > 0.68 ? (grain2 - 0.68) * 3.5 : 0;
      const lightGrain2 = grain1 > 0.75 ? (grain1 - 0.75) * 2.0 : 0;
      
      // Wet/dark patches
      const wetPatch = n1 < 0.35 ? (0.35 - n1) * 0.5 : 0;
      
      // Bright/dry patches
      const dryPatch = n1 > 0.65 ? (n1 - 0.65) * 0.6 : 0;
      
      // Base with grain influence
      const grainMix = grain1 * 0.25 + grain2 * 0.25 + grain3 * 0.25 + grain4 * 0.25;
      const baseValue = 0.4 + grainMix * 0.5 + n2 * 0.15;
      
      // White/cream sand - light base colors
      let r = 200 + baseValue * 50;
      let g = 195 + baseValue * 50;
      let b = 175 + baseValue * 55;
      
      // Dark grains
      r -= (darkGrain + darkGrain2) * 50;
      g -= (darkGrain + darkGrain2) * 50;
      b -= (darkGrain + darkGrain2) * 45;
      
      // Light grains - white sparkle
      r += (lightGrain + lightGrain2) * 40;
      g += (lightGrain + lightGrain2) * 40;
      b += (lightGrain + lightGrain2) * 40;
      
      // Wet patches
      r -= wetPatch * 35;
      g -= wetPatch * 35;
      b -= wetPatch * 30;
      
      // Dry patches
      r += dryPatch * 30;
      g += dryPatch * 30;
      b += dryPatch * 28;
      
      // Subtle color variation
      const colorVar = seamlessFBM(x * 0.4 + 100, y * 0.4 + 100, size, 2);
      r += (colorVar - 0.5) * 15;
      g += (colorVar - 0.5) * 10;
      b -= (colorVar - 0.5) * 8;
      
      data[i] = Math.max(0, Math.min(255, Math.floor(r)));
      data[i + 1] = Math.max(0, Math.min(255, Math.floor(g)));
      data[i + 2] = Math.max(0, Math.min(255, Math.floor(b)));
      data[i + 3] = 255;
    }
  }

  const texture = device.createTexture({
    size: [size, size, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture }, data, { bytesPerRow: size * 4 }, [size, size, 1]);
  return texture;
}

/**
 * Generate ROCK texture - Cracked sandstone with veins
 * @param {GPUDevice} device 
 * @returns {GPUTexture}
 */
export function createRockTexture(device) {
  const size = 512;
  const data = new Uint8Array(size * size * 4);

  // Helper function to create crack pattern
  function crackNoise(px, py, scale) {
    const x = px * scale;
    const y = py * scale;
    
    const n1 = noise(x, y);
    const n2 = noise(x + 0.5, y + 0.3);
    const n3 = noise(x - 0.3, y + 0.5);
    
    const minVal = Math.min(n1, n2, n3);
    const diff = Math.abs(n1 - n2) + Math.abs(n2 - n3) + Math.abs(n1 - n3);
    
    return { min: minVal, crack: diff };
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      
      // Crack patterns at multiple scales
      const crack1 = crackNoise(x, y, 0.015);
      const crack2 = crackNoise(x, y, 0.04);
      const crack3 = crackNoise(x, y, 0.1);
      
      // Combine crack intensities
      const largeCrack = crack1.crack > 0.4 ? (crack1.crack - 0.4) * 2.5 : 0;
      const medCrack = crack2.crack > 0.45 ? (crack2.crack - 0.45) * 2.0 : 0;
      const fineCrack = crack3.crack > 0.5 ? (crack3.crack - 0.5) * 1.5 : 0;
      
      // Base rock color
      const baseNoise = seamlessFBM(x * 0.5, y * 0.5, size, 3);
      const colorVar = seamlessFBM(x * 0.3, y * 0.3, size, 2);
      
      // Base sandstone color
      let r = 165 + baseNoise * 40 + colorVar * 25;
      let g = 120 + baseNoise * 35 + colorVar * 20;
      let b = 95 + baseNoise * 25 + colorVar * 15;
      
      // Weathered patches
      const weatherNoise = seamlessFBM(x * 0.2 + 100, y * 0.2 + 100, size, 2);
      const isWeathered = weatherNoise > 0.6 ? (weatherNoise - 0.6) * 2.5 : 0;
      r += isWeathered * 35;
      g += isWeathered * 40;
      b += isWeathered * 35;
      
      // Darker patches - iron staining
      const stainNoise = seamlessFBM(x * 0.25 + 200, y * 0.25 + 200, size, 2);
      const isStained = stainNoise < 0.35 ? (0.35 - stainNoise) * 2.0 : 0;
      r += isStained * 15;
      g -= isStained * 20;
      b -= isStained * 25;
      
      // Apply cracks
      const totalCrack = largeCrack * 0.5 + medCrack * 0.3 + fineCrack * 0.2;
      r -= totalCrack * 70;
      g -= totalCrack * 60;
      b -= totalCrack * 50;
      
      // Surface texture
      const surfaceGrain = noise(x * 1.5, y * 1.5) * 0.15 + noise(x * 3, y * 3) * 0.08;
      r += (surfaceGrain - 0.1) * 40;
      g += (surfaceGrain - 0.1) * 35;
      b += (surfaceGrain - 0.1) * 30;
      
      // Erosion pits
      const pitNoise = noise(x * 0.8, y * 0.8);
      if (pitNoise > 0.85) {
        const pitDepth = (pitNoise - 0.85) * 5;
        r -= pitDepth * 40;
        g -= pitDepth * 35;
        b -= pitDepth * 30;
      }
      
      // Lichen/mineral deposits
      const lichenNoise = seamlessFBM(x * 0.4 + 300, y * 0.4 + 300, size, 2);
      if (lichenNoise > 0.72) {
        const lichen = (lichenNoise - 0.72) * 3;
        r -= lichen * 25;
        g += lichen * 5;
        b += lichen * 15;
      }
      
      data[i] = Math.max(0, Math.min(255, Math.floor(r)));
      data[i + 1] = Math.max(0, Math.min(255, Math.floor(g)));
      data[i + 2] = Math.max(0, Math.min(255, Math.floor(b)));
      data[i + 3] = 255;
    }
  }

  const texture = device.createTexture({
    size: [size, size, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture }, data, { bytesPerRow: size * 4 }, [size, size, 1]);
  return texture;
}

/**
 * Generate SNOW texture - bright white with sparkles
 * @param {GPUDevice} device 
 * @returns {GPUTexture}
 */
export function createSnowTexture(device) {
  const size = 512;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      
      // Seamless snow drifts
      const driftN = seamlessFBM(x, y, size, 3);
      
      // Sparkle effect
      const sparkleN = noise(x * 0.4, y * 0.4);
      const sparkle = sparkleN > 0.93 ? (sparkleN - 0.93) * 1.5 : 0;
      
      // Subtle shadows in drifts
      const shadow = driftN < 0.35 ? (0.35 - driftN) * 0.15 : 0;
      
      const base = 0.94 + driftN * 0.06 + sparkle - shadow;
      
      data[i] = Math.min(255, Math.floor(240 * base));
      data[i + 1] = Math.min(255, Math.floor(245 * base));
      data[i + 2] = Math.min(255, Math.floor(255 * base));
      data[i + 3] = 255;
    }
  }

  const texture = device.createTexture({
    size: [size, size, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture }, data, { bytesPerRow: size * 4 }, [size, size, 1]);
  return texture;
}

/**
 * Create a flat normal map texture (default fallback)
 * @param {GPUDevice} device 
 * @param {number} size 
 * @returns {GPUTexture}
 */
export function createFlatNormalTexture(device, size = 4) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 0] = 128;  // R = 0.5 (no X offset)
    data[i * 4 + 1] = 128;  // G = 0.5 (no Y offset)
    data[i * 4 + 2] = 255;  // B = 1.0 (pointing up)
    data[i * 4 + 3] = 255;  // A = 1.0
  }
  
  const texture = device.createTexture({
    size: [size, size, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    data,
    { bytesPerRow: size * 4 },
    [size, size]
  );
  return texture;
}
