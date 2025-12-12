/**
 * Terrain Shader - WGSL shader for procedural terrain rendering
 * Features: triplanar mapping, multi-scale texturing, caustics, rain splashes
 * Part of TypeGPU-Project-World modular shader system
 */

/**
 * Main terrain rendering shader with:
 * - Procedural height generation
 * - Triplanar texture sampling for grass, sand, rock, snow
 * - Biome blending based on height and slope
 * - Underwater caustics
 * - Day/night cycle lighting
 * - Shadow mapping
 * - Rain splash effects
 */
export const terrainShader = `
  struct Camera { viewProjection: mat4x4f, position: vec3f, time: f32, cloudCoverage: f32, starBlur: f32, skyDarkening: f32, lightningFlash: f32, lightningPosX: f32, lightningPosY: f32, dayTime: f32 }
  struct Terrain { model: mat4x4f, color: vec3f, pad: f32 }
  struct Light { viewProjection: mat4x4f, position: vec3f, pad: f32 }
  @group(0) @binding(0) var<uniform> camera: Camera;
  @group(0) @binding(1) var<uniform> terrain: Terrain;
  @group(0) @binding(2) var grassTex: texture_2d<f32>;
  @group(0) @binding(3) var sandTex: texture_2d<f32>;
  @group(0) @binding(4) var rockTex: texture_2d<f32>;
  @group(0) @binding(5) var snowTex: texture_2d<f32>;
  @group(0) @binding(6) var texSampler: sampler;
  @group(0) @binding(7) var<uniform> light: Light;
  @group(0) @binding(8) var shadowMap: texture_depth_2d;
  @group(0) @binding(9) var shadowSampler: sampler_comparison;
  @group(0) @binding(10) var rockNormalTex: texture_2d<f32>;
  @group(0) @binding(11) var grassNormalTex: texture_2d<f32>;
  @group(0) @binding(12) var sandNormalTex: texture_2d<f32>;

  struct VSIn { @location(0) pos: vec3f, @location(1) uv: vec2f }
  struct VSOut { 
    @builtin(position) pos: vec4f, 
    @location(0) height: f32,
    @location(1) norm: vec3f, 
    @location(2) worldXZ: vec2f,
    @location(3) worldPos: vec3f,
    @location(4) shadowCoord: vec4f
  }

  // Simple hash - uses only basic operations for JS/WGSL compatibility
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

  // ============================================
  // REFRACTION CAUSTICS - Voronoi-based light network
  // Simulates light bending through water surface waves
  // Creates the characteristic bright line network pattern
  // ============================================
  
  // Hash functions for Voronoi
  fn hash2(p: vec2f) -> vec2f {
    let k = vec2f(0.3183099, 0.3678794);
    var pp = p;
    pp = pp * k + k.yx;
    return fract(16.0 * k * fract(pp.x * pp.y * (pp.x + pp.y))) * 2.0 - 1.0;
  }
  
  // Smooth Voronoi that returns distance to edges (the bright lines)
  fn voronoiEdges(p: vec2f, time: f32) -> f32 {
    let cell = floor(p);
    let f = fract(p);
    
    var minDist1 = 8.0;
    var minDist2 = 8.0;
    
    // Check 3x3 neighborhood
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        let neighbor = vec2f(f32(i), f32(j));
        let cellPos = cell + neighbor;
        
        // Animated random point in each cell
        var point = hash2(cellPos);
        point = 0.5 + 0.4 * sin(time * 0.8 + 6.2831 * point);
        
        let diff = neighbor + point - f;
        let dist = length(diff);
        
        if (dist < minDist1) {
          minDist2 = minDist1;
          minDist1 = dist;
        } else if (dist < minDist2) {
          minDist2 = dist;
        }
      }
    }
    
    // Edge distance - difference between closest and second closest
    return minDist2 - minDist1;
  }
  
  // Multi-layer caustics with refraction simulation
  fn calculateCaustics(worldXZ: vec2f, time: f32, waterLevel: f32, terrainY: f32) -> f32 {
    let depth = waterLevel - terrainY;
    
    // STRICT CHECK - No caustics if terrain is at or above water level
    // Use higher threshold to prevent edge bleeding
    if (depth <= 2.0) {
      return 0.0;  // Completely cut off caustics near/above water surface
    }
    
    // Scale based on depth - light spreads more at greater depths
    let baseScale = 0.08;
    let depthScale = 1.0 + depth * 0.03;
    
    // Layer 1: Large slow-moving caustic pattern
    let uv1 = worldXZ * baseScale / depthScale;
    let t1 = time * 0.25;
    let layer1 = voronoiEdges(uv1 + vec2f(t1 * 0.08, t1 * 0.04), t1);
    
    // Layer 2: Medium pattern moving differently
    let uv2 = worldXZ * baseScale * 1.5 / depthScale;
    let t2 = time * 0.3;
    let layer2 = voronoiEdges(uv2 + vec2f(-t2 * 0.06, t2 * 0.09), t2 * 1.2);
    
    // Layer 3: Small detail ripples
    let uv3 = worldXZ * baseScale * 2.3 / depthScale;
    let t3 = time * 0.35;
    let layer3 = voronoiEdges(uv3 + vec2f(t3 * 0.1, -t3 * 0.05), t3 * 0.8);
    
    // Soft gradient falloff from edges - much smoother transition
    let c1 = exp(-layer1 * 4.0);
    let c2 = exp(-layer2 * 5.0);
    let c3 = exp(-layer3 * 6.0);
    
    // Blend layers - multiply for more natural light interaction
    var caustics = (c1 * 0.5 + c2 * 0.3 + c3 * 0.2);
    
    // Add subtle noise variation for organic feel
    let noise = sin(worldXZ.x * 0.3 + time * 0.5) * sin(worldXZ.y * 0.25 + time * 0.4);
    caustics *= 0.85 + noise * 0.15;
    
    // DEPTH INTENSITY - More caustics in deep water (magnifying lens effect)
    // 0 at shallow, gradually increasing to deep water
    let shallowFade = smoothstep(2.0, 10.0, depth);  // Fade in from 2 to 10 units depth
    let deepBoost = smoothstep(6.0, 25.0, depth);   // Extra boost in deep water
    let depthIntensity = shallowFade * (0.5 + deepBoost * 0.7);  // 0 at shore, up to 1.2 in deep
    
    // Very deep water still fades slightly (light can't reach forever)
    let veryDeepFade = exp(-max(0.0, depth - 40.0) * 0.02);
    
    caustics *= depthIntensity * veryDeepFade;
    
    return caustics;
  }

  @vertex fn vs(in: VSIn) -> VSOut {
    var o: VSOut;
    
    // Grid snapping to prevent visual undulation
    let gridSize = 15.625;
    let snappedX = floor(camera.position.x / gridSize) * gridSize;
    let snappedZ = floor(camera.position.z / gridSize) * gridSize;
    
    let worldX = in.pos.x + snappedX;
    let worldZ = in.pos.z + snappedZ;
    let h = getHeight(worldX, worldZ);
    
    let eps = 4.0;
    let hL = getHeight(worldX - eps, worldZ);
    let hR = getHeight(worldX + eps, worldZ);
    let hD = getHeight(worldX, worldZ - eps);
    let hU = getHeight(worldX, worldZ + eps);
    o.norm = normalize(vec3f(hL - hR, 2.0 * eps, hD - hU));
    
    var worldPos = vec3f(worldX, h, worldZ);
    o.pos = camera.viewProjection * vec4f(worldPos, 1.0);
    o.height = h;
    o.worldXZ = vec2f(worldX, worldZ);
    o.worldPos = worldPos;
    
    // Calculate shadow coordinates
    o.shadowCoord = light.viewProjection * vec4f(worldPos, 1.0);
    return o;
  }

  // Triplanar texture sampling - avoids stretching on slopes
  fn triplanarSample(tex: texture_2d<f32>, samp: sampler, worldPos: vec3f, normal: vec3f, scale: f32) -> vec3f {
    // Calculate blend weights based on normal
    var blend = abs(normal);
    blend = blend / (blend.x + blend.y + blend.z + 0.0001);
    
    // Sample from 3 projections
    let uvX = worldPos.zy * scale;
    let uvY = worldPos.xz * scale;
    let uvZ = worldPos.xy * scale;
    
    let colX = textureSample(tex, samp, uvX).rgb;
    let colY = textureSample(tex, samp, uvY).rgb;
    let colZ = textureSample(tex, samp, uvZ).rgb;
    
    return colX * blend.x + colY * blend.y + colZ * blend.z;
  }
  
  // Triplanar normal sampling - returns perturbed normal from normal map
  fn triplanarNormalSample(tex: texture_2d<f32>, samp: sampler, worldPos: vec3f, normal: vec3f, scale: f32, strength: f32) -> vec3f {
    // Calculate blend weights based on normal
    var blend = abs(normal);
    blend = blend / (blend.x + blend.y + blend.z + 0.0001);
    
    // Sample from 3 projections
    let uvX = worldPos.zy * scale;
    let uvY = worldPos.xz * scale;
    let uvZ = worldPos.xy * scale;
    
    // Sample normal maps (convert from 0-1 to -1 to 1)
    let nX = textureSample(tex, samp, uvX).rgb * 2.0 - 1.0;
    let nY = textureSample(tex, samp, uvY).rgb * 2.0 - 1.0;
    let nZ = textureSample(tex, samp, uvZ).rgb * 2.0 - 1.0;
    
    // Reorient normals based on projection axis (swizzle to world space)
    // For +X face (ZY plane): normal.x controls blend
    let normalX = vec3f(normal.x, nX.y, nX.x) * sign(normal.x);
    // For +Y face (XZ plane): normal.y controls blend  
    let normalY = vec3f(nY.x, normal.y, nY.y) * sign(normal.y);
    // For +Z face (XY plane): normal.z controls blend
    let normalZ = vec3f(nZ.x, nZ.y, normal.z) * sign(normal.z);
    
    // Blend normals using UDN (Unreal Developer Network) blending
    var blendedNormal = normalX * blend.x + normalY * blend.y + normalZ * blend.z;
    
    // Perturb the surface normal with strength control
    let perturbedNormal = normalize(normal + blendedNormal * strength);
    
    return perturbedNormal;
  }

  // Distance-based texture scaling to reduce tiling artifacts
  // Close: higher scale (more detail), Far: lower scale (less repetition)
  fn triplanarMultiScale(tex: texture_2d<f32>, samp: sampler, worldPos: vec3f, normal: vec3f, viewDist: f32) -> vec3f {
    // Define distance thresholds for LOD transitions
    let nearDist = 30.0;    // Full detail up to this distance
    let midDist = 150.0;    // Medium detail
    let farDist = 500.0;    // Minimum detail beyond this distance
    
    // Three-level LOD system for smoother transitions
    let nearToMid = smoothstep(nearDist, midDist, viewDist);
    let midToFar = smoothstep(midDist, farDist, viewDist);
    
    // Scale ranges: close = 0.1 (detailed), mid = 0.02, far = 0.005 (very few repetitions)
    let nearScale = 0.1;
    let midScale = 0.02;
    let farScale = 0.005;
    
    // Sample at different scales
    let nearColor = triplanarSample(tex, samp, worldPos, normal, nearScale);
    let midColor = triplanarSample(tex, samp, worldPos, normal, midScale);
    let farColor = triplanarSample(tex, samp, worldPos, normal, farScale);
    
    // Blend through the LOD levels
    let nearMidBlend = mix(nearColor, midColor, nearToMid);
    return mix(nearMidBlend, farColor, midToFar);
  }

  @fragment fn fs(in: VSOut) -> @location(0) vec4f {
    // Dynamic sun/moon direction based on time (day/night cycle)
    let cycleDuration = 120.0;  // Must match sky shader
    let timeOfDay = fract(camera.dayTime / cycleDuration);
    let sunAngle = timeOfDay * 6.283185;
    let sunHeight = sin(sunAngle - 1.5708);
    let sunX = cos(sunAngle - 1.5708);
    
    // Moon is opposite to sun
    let moonHeight = -sunHeight;
    let moonX = -sunX;
    
    // Calculate day/night factors for lighting
    var dayFactor = 0.0;
    if (timeOfDay >= 0.25 && timeOfDay <= 0.75) {
      dayFactor = 1.0;
    } else if (timeOfDay < 0.25) {
      dayFactor = smoothstep(0.15, 0.25, timeOfDay);
    } else {
      dayFactor = 1.0 - smoothstep(0.75, 0.85, timeOfDay);
    }
    let nightFactor = 1.0 - dayFactor;
    
    // Light direction: smooth blend between sun and moon (no abrupt switch)
    let lightBlendTerrain = smoothstep(0.3, 0.7, nightFactor);
    
    // Sun and moon positions
    let sunDirT = normalize(vec3f(sunX, max(sunHeight, 0.05), 0.3));
    let moonDirT = normalize(vec3f(moonX, max(moonHeight, 0.15), -0.15));
    
    // Smooth blend between sun and moon direction
    let lightDir = normalize(mix(sunDirT, moonDirT, lightBlendTerrain));
    
    // Smooth intensity transition
    let lightIntensity = mix(1.0, 0.75, lightBlendTerrain);
    
    // Smooth color transition from warm sun to cool moon
    let sunLightColorT = vec3f(1.0, 0.98, 0.95);   // Warm sunlight
    let moonLightColorT = vec3f(0.7, 0.8, 0.95);   // Blue-white moonlight
    let lightColor = mix(sunLightColorT, moonLightColorT, lightBlendTerrain);
    
    let diff = max(dot(in.norm, lightDir), 0.0) * lightIntensity;
    let ambient = 0.30 + 0.18 * dayFactor;  // Higher base ambient for visible terrain at night
    
    // Water level for underwater effects
    let waterLevel = 8.0;
    let isUnderwater = in.worldPos.y < waterLevel;
    let underwaterDepth = waterLevel - in.worldPos.y;
    let cameraUnderwater = camera.position.y < waterLevel;
    
    // Calculate view distance for LOD
    let viewDist = length(camera.position - in.worldPos);
    
    // Sample rock normal map for bump effect (use same scale as near texture)
    let rockBumpStrength = 10.0;  // Extreme bump effect
    let rockNormalScale = 0.1;    // Match the near texture scale
    let perturbedRockNormal = triplanarNormalSample(rockNormalTex, texSampler, in.worldPos, in.norm, rockNormalScale, rockBumpStrength);
    
    // Sample grass normal map for bump effect
    let grassBumpStrength = 7.0;  // Very strong bump for grass
    let grassNormalScale = 0.1;   // Match the near texture scale
    let perturbedGrassNormal = triplanarNormalSample(grassNormalTex, texSampler, in.worldPos, in.norm, grassNormalScale, grassBumpStrength);
    
    // Sample sand normal map for bump effect
    let sandBumpStrength = 6.0;   // Strong bump for sand dunes/ripples
    let sandNormalScale = 0.1;    // Match the near texture scale
    let perturbedSandNormal = triplanarNormalSample(sandNormalTex, texSampler, in.worldPos, in.norm, sandNormalScale, sandBumpStrength);
    
    // Multi-scale triplanar texture sampling - reduces visible tiling
    var grassCol = triplanarMultiScale(grassTex, texSampler, in.worldPos, in.norm, viewDist);
    let sandCol = triplanarMultiScale(sandTex, texSampler, in.worldPos, in.norm, viewDist);
    let snowCol = triplanarMultiScale(snowTex, texSampler, in.worldPos, in.norm, viewDist);
    
    // GRASS with 3 SMOOTH tonal zones - natural gradual transitions
    // Ultra-low frequency noise for very smooth gradients
    let grassTone1 = smoothNoise(in.worldPos.x * 0.002, in.worldPos.z * 0.002);
    let grassTone2 = smoothNoise(in.worldPos.x * 0.004 + 300.0, in.worldPos.z * 0.004 + 300.0);
    let grassTone3 = smoothNoise(in.worldPos.x * 0.0015 + 600.0, in.worldPos.z * 0.0015 + 600.0);
    let grassTone4 = smoothNoise(in.worldPos.x * 0.003 + 900.0, in.worldPos.z * 0.003 + 900.0);
    
    // Combine for smooth organic variation
    let combinedGrassTone = grassTone1 * 0.4 + grassTone2 * 0.3 + grassTone3 * 0.2 + grassTone4 * 0.1;
    
    // === THREE TONAL ZONES - all smoothly blended ===
    
    // ZONE 1: Dark/shaded grass (valleys, depressions, shade)
    // Uses height-based factor + noise for natural distribution
    let valleyFactor = smoothNoise(in.worldPos.x * 0.0025 + 1200.0, in.worldPos.z * 0.0025 + 1200.0);
    let darkZone = valleyFactor * 0.6 + (1.0 - combinedGrassTone) * 0.4;
    // Darker, slightly bluer green (shaded grass)
    let darkGrass = vec3f(
      grassCol.r * 0.75,
      grassCol.g * 0.85,
      grassCol.b * 1.1
    );
    
    // ZONE 2: Normal/mid-tone grass (base color)
    let midGrass = grassCol;
    
    // ZONE 3: Bright/sun-exposed grass (hilltops, sunny areas)
    let brightZone = combinedGrassTone;
    // Brighter, slightly yellower green (sun-kissed grass)
    let brightGrass = vec3f(
      grassCol.r * 1.1 + 0.04,
      grassCol.g * 1.15 + 0.05,
      grassCol.b * 0.9
    );
    
    // Smooth blend between all three zones
    // darkZone: 0-0.4 = dark dominant
    // midZone: 0.3-0.7 = mid dominant  
    // brightZone: 0.6-1.0 = bright dominant
    let darkWeight = smoothstep(0.5, 0.2, combinedGrassTone) * darkZone;
    let brightWeight = smoothstep(0.5, 0.8, combinedGrassTone) * brightZone;
    let midWeight = 1.0 - darkWeight - brightWeight;
    
    // Ensure weights are valid
    let totalGrassWeight = max(darkWeight + midWeight + brightWeight, 0.001);
    
    // Blend all three tones smoothly
    grassCol = (darkGrass * darkWeight + midGrass * midWeight + brightGrass * brightWeight) / totalGrassWeight;
    
    // ROCK with STRONG tonal variation - very visible different color zones
    var rockCol = triplanarMultiScale(rockTex, texSampler, in.worldPos, in.norm, viewDist);
    
    // Large-scale color variation - MORE PRONOUNCED
    let rockTone1 = smoothNoise(in.worldPos.x * 0.006, in.worldPos.z * 0.006);
    let rockTone2 = smoothNoise(in.worldPos.x * 0.015 + 500.0, in.worldPos.z * 0.015 + 500.0);
    let rockTone3 = smoothNoise(in.worldPos.x * 0.004 + 1000.0, in.worldPos.z * 0.004 + 1000.0);
    let rockTone4 = smoothNoise(in.worldPos.x * 0.025 + 1500.0, in.worldPos.z * 0.025 + 1500.0);
    
    // STRONG warm/cool variation (reddish vs grayish rocks)
    let warmCool = (rockTone1 - 0.5) * 0.6;
    rockCol.r += warmCool * 0.25;
    rockCol.g += warmCool * 0.05;
    rockCol.b -= warmCool * 0.18;
    
    // STRONG light/dark patches - very visible
    let lightDark = (rockTone2 - 0.5) * 0.5;
    rockCol = rockCol * (1.0 + lightDark);
    
    // Weathered/bleached patches (desaturated and lighter)
    let weathered = smoothstep(0.55, 0.75, rockTone3);
    let grayRock = vec3f(dot(rockCol, vec3f(0.3, 0.5, 0.2)));
    rockCol = mix(rockCol, grayRock + 0.15, weathered * 0.5);
    
    // Iron oxide stain patches (orange/rust color) - MORE VISIBLE
    let ironStain = smoothstep(0.15, 0.35, rockTone1) * smoothstep(0.6, 0.4, rockTone1);
    rockCol.r += ironStain * 0.18;
    rockCol.g -= ironStain * 0.08;
    rockCol.b -= ironStain * 0.12;
    
    // Dark moss/lichen patches in crevices
    let mossPatch = smoothstep(0.7, 0.85, rockTone4);
    rockCol.r -= mossPatch * 0.08;
    rockCol.g += mossPatch * 0.03;
    rockCol.b -= mossPatch * 0.05;
    
    let h = in.height;
    var col: vec3f;
    
    // ============================================
    // BIOME BLENDING - Soft for vegetation, sharper for rock
    // ============================================
    
    // Multiple noise layers at different scales for organic variation
    let n1 = smoothNoise(in.worldPos.x * 0.004, in.worldPos.z * 0.004);
    let n2 = smoothNoise(in.worldPos.x * 0.008 + 50.0, in.worldPos.z * 0.008 + 50.0);
    let n3 = smoothNoise(in.worldPos.x * 0.015 + 100.0, in.worldPos.z * 0.015 + 100.0);
    let n4 = smoothNoise(in.worldPos.x * 0.003 + 150.0, in.worldPos.z * 0.003 + 150.0);
    
    // Combine noise for boundary variation
    let combinedNoise = n1 * 0.4 + n2 * 0.3 + n3 * 0.2 + n4 * 0.1;
    let heightOffset = (combinedNoise - 0.5) * 25.0;
    let effectiveHeight = h + heightOffset;
    
    // Different blend widths: smooth transitions
    let blendWidth = 15.0;   // General blend width
    let rockBlend = 8.0;     // Rock transition (sharper but not too sharp)
    
    // Define biome centers
    let sandCenter = 15.0;
    let grassCenter = 35.0;
    let rockCenter = 55.0;
    let snowCenter = 75.0;
    
    // Calculate weights - smooth Gaussian falloff
    let sandDist = abs(effectiveHeight - sandCenter) / blendWidth;
    let grassDist = abs(effectiveHeight - grassCenter) / blendWidth;
    let rockDist = abs(effectiveHeight - rockCenter) / rockBlend;
    let snowDist = abs(effectiveHeight - snowCenter) / (blendWidth * 1.5);
    
    // Smooth falloff exponents
    let sandWeight = exp(-sandDist * sandDist * 1.0);
    let grassWeight = exp(-grassDist * grassDist * 0.8);
    let rockWeight = exp(-rockDist * rockDist * 2.0);
    let snowWeight = exp(-snowDist * snowDist * 0.4);
    
    // Noise for organic patches
    let patchNoise1 = smoothNoise(in.worldPos.x * 0.008 + 200.0, in.worldPos.z * 0.008 + 200.0);
    let patchNoise2 = smoothNoise(in.worldPos.x * 0.015 + 250.0, in.worldPos.z * 0.015 + 250.0);
    
    // Modulate weights with noise for natural variation
    var sandW = sandWeight * (0.8 + patchNoise1 * 0.4);
    var grassW = grassWeight * (0.7 + patchNoise2 * 0.6);
    var rockW = rockWeight * (0.85 + patchNoise1 * 0.3);
    var snowW = snowWeight * (0.8 + patchNoise2 * 0.4);
    
    // Height-based adjustments - sand dominant at low heights
    let sandBoost = 1.0 + smoothstep(25.0, 10.0, h) * 2.0;
    sandW *= sandBoost;
    
    // Grass appears gradually
    let grassAppear = smoothstep(15.0, 30.0, h);
    grassW *= grassAppear;
    
    // Snow appears gradually at high altitudes
    let snowAppear = smoothstep(50.0, 70.0, h);
    snowW *= snowAppear;
    
    // Rock boost at mid-high altitudes
    let rockBoost = smoothstep(40.0, 55.0, h) * smoothstep(80.0, 60.0, h);
    rockW *= (1.0 + rockBoost * 0.6);
    
    // Ensure all weights are positive
    sandW = max(sandW, 0.01);
    grassW = max(grassW, 0.0);
    rockW = max(rockW, 0.0);
    snowW = max(snowW, 0.0);
    
    // Normalize weights so they sum to 1
    let totalWeight = sandW + grassW + rockW + snowW;
    sandW /= totalWeight;
    grassW /= totalWeight;
    rockW /= totalWeight;
    snowW /= totalWeight;
    
    // Blend all textures using normalized weights
    col = sandCol * sandW + grassCol * grassW + rockCol * rockW + snowCol * snowW;
    
    // Slope-based rock influence (steep = more rock, smooth transition)
    let slope = 1.0 - in.norm.y;
    let slopeRock = smoothstep(0.25, 0.50, slope);  // Gradual transition
    col = mix(col, rockCol, slopeRock * 0.5);
    
    // Calculate total rock influence for bump mapping
    let totalRockInfluence = min(rockW + slopeRock * 0.5, 1.0);
    
    // Blend perturbed normals based on terrain weights
    // Use lerp between normals based on material weights
    var finalNormal = in.norm;
    
    // Apply sand bump where sand is present (near water/beach)
    finalNormal = normalize(mix(finalNormal, perturbedSandNormal, sandW));
    
    // Apply grass bump where grass is present
    finalNormal = normalize(mix(finalNormal, perturbedGrassNormal, grassW));
    
    // Apply rock bump where rock is present (overrides grass on slopes)
    finalNormal = normalize(mix(finalNormal, perturbedRockNormal, totalRockInfluence));
    
    // Recalculate diffuse lighting with perturbed normal for bump effect
    let diffBump = max(dot(finalNormal, lightDir), 0.0) * lightIntensity;
    // Use bumped lighting directly for affected areas
    let totalBumpInfluence = min(totalRockInfluence + grassW + sandW, 1.0);
    let finalDiff = mix(diff, diffBump, totalBumpInfluence);
    
    // Shadow calculation
    let shadowNDC = in.shadowCoord.xyz / in.shadowCoord.w;
    let shadowUV = shadowNDC.xy * 0.5 + 0.5;
    let shadowDepth = shadowNDC.z - 0.005; // Increased bias for low sun angle
    
    // PCF soft shadows - always sample (uniform control flow required)
    let texelSize = 1.0 / 2048.0;
    var shadowSum = 0.0;
    let flipUV = vec2f(shadowUV.x, 1.0 - shadowUV.y);
    shadowSum += textureSampleCompare(shadowMap, shadowSampler, flipUV + vec2f(-texelSize, -texelSize), shadowDepth);
    shadowSum += textureSampleCompare(shadowMap, shadowSampler, flipUV + vec2f(0.0, -texelSize), shadowDepth);
    shadowSum += textureSampleCompare(shadowMap, shadowSampler, flipUV + vec2f(texelSize, -texelSize), shadowDepth);
    shadowSum += textureSampleCompare(shadowMap, shadowSampler, flipUV + vec2f(-texelSize, 0.0), shadowDepth);
    shadowSum += textureSampleCompare(shadowMap, shadowSampler, flipUV, shadowDepth);
    shadowSum += textureSampleCompare(shadowMap, shadowSampler, flipUV + vec2f(texelSize, 0.0), shadowDepth);
    shadowSum += textureSampleCompare(shadowMap, shadowSampler, flipUV + vec2f(-texelSize, texelSize), shadowDepth);
    shadowSum += textureSampleCompare(shadowMap, shadowSampler, flipUV + vec2f(0.0, texelSize), shadowDepth);
    shadowSum += textureSampleCompare(shadowMap, shadowSampler, flipUV + vec2f(texelSize, texelSize), shadowDepth);
    
    // Check bounds and apply shadow
    let inBounds = shadowUV.x >= 0.0 && shadowUV.x <= 1.0 && shadowUV.y >= 0.0 && shadowUV.y <= 1.0 && shadowDepth < 1.0;
    var shadow = select(1.0, shadowSum / 9.0, inBounds);
    
    // Soften shadows underwater - light scatters, making shadows less defined
    if (isUnderwater) {
      // Shadows fade with depth - deeper = more scattered light = softer shadows
      let shadowFade = smoothstep(0.0, 30.0, underwaterDepth);
      shadow = mix(shadow, 1.0, 0.6 + shadowFade * 0.3); // 60-90% shadow reduction
    }
    
    // At night, shadows are softer (moonlight is diffuse)
    // During day, shadows are sharper
    shadow = mix(0.7, shadow, dayFactor * 0.9 + 0.1 * nightFactor);
    
    // Apply shadow to lighting with light color (using bump-mapped diffuse for rocks)
    var lighting = ambient + finalDiff * (1.0 - ambient) * shadow;
    
    // Apply light color tint (blue at night, warm during day)
    col = col * (lightColor * lighting);
    
    // ============================================
    // UNDERWATER CAUSTICS - Refraction light network
    // Only visible when terrain is underwater
    // ============================================
    if (isUnderwater) {
      let time = camera.time;
      let worldXZ = in.worldPos.xz;
      
      // ============ REFRACTION CAUSTICS ============
      // Soft, diffused light patterns like real underwater caustics
      // Only visible during daytime (sunlight creates caustics, not moonlight)
      let caustics = calculateCaustics(worldXZ, time, waterLevel, in.worldPos.y);
      
      // Bright and vivid - boost intensity while keeping softness
      // Multiply by dayFactor so caustics fade out at night
      let causticsIntensity = pow(caustics, 0.7) * 2.8 * dayFactor;
      
      // Warm bright sunlight color
      let causticsColor = vec3f(1.0, 0.98, 0.92);
      col += causticsColor * causticsIntensity;
      
      // Depth fade for underwater effects
      let depthFade = exp(-underwaterDepth * 0.03);
      
      // ============ UNDERWATER TINT ============
      // Subtle blue-green tint that increases with depth
      let tintStrength = (1.0 - depthFade) * 0.3;
      let underwaterTint = vec3f(0.1, 0.3, 0.5);
      col = mix(col, col + underwaterTint * 0.2, tintStrength);
      
      // Keep it bright underwater - less darkening
      lighting *= 0.85 + depthFade * 0.15;
      
      // ============ UNDERWATER LIGHT SCATTERING + FOG ============
      // Real water effect - objects blend into luminous water color
      // Combined with visibility fog for realistic underwater experience
      if (cameraUnderwater) {
        let distToCamera = length(in.worldPos - camera.position);
        
        // === VISIBILITY FOG - Makes distant objects invisible ===
        let fogDensity = 0.035; // Controls how far you can see
        let fogAmount = 1.0 - exp(-distToCamera * fogDensity);
        
        // === LUMINOUS WATER COLOR (not dark!) ===
        let cameraDepth = waterLevel - camera.position.y;
        let depthRatio = clamp(cameraDepth / 40.0, 0.0, 1.0);
        
        // Bright water colors that objects fade INTO - lighter and more green
        let surfaceWater = vec3f(0.25, 0.55, 0.55);  // Light cyan-green
        let midWater = vec3f(0.18, 0.48, 0.50);      // Soft aqua
        let deepWaterColor = vec3f(0.12, 0.40, 0.45); // Gentle teal
        
        var waterColor = mix(surfaceWater, midWater, smoothstep(0.0, 0.4, depthRatio));
        waterColor = mix(waterColor, deepWaterColor, smoothstep(0.4, 1.0, depthRatio));
        
        // Subtle light variation
        let lightDance = sin(camera.time * 0.5 + distToCamera * 0.1) * 0.03 + 1.0;
        waterColor *= lightDance;
        
        // === APPLY FOG - Objects disappear into luminous water ===
        col = mix(col, waterColor, fogAmount);
        
        // === COLOR ABSORPTION (before full fog) ===
        // Red fades first, blue travels furthest
        let nearDist = min(distToCamera, 40.0); // Only apply to nearby objects
        let absorptionRate = vec3f(0.03, 0.015, 0.005);
        let absorption = exp(-nearDist * absorptionRate);
        col *= absorption;
        
        // Boost blue for underwater tint
        col.b = col.b * 1.08 + fogAmount * 0.02;
        col.g = col.g * 1.03;
        
        // Contrast fades with distance (before fog takes over completely)
        let contrastLoss = smoothstep(5.0, 30.0, distToCamera);
        let avgBrightness = (col.r + col.g + col.b) / 3.0;
        col = mix(col, vec3f(avgBrightness) * vec3f(0.9, 1.0, 1.08), contrastLoss * 0.5);
      }
    }
    
    // Apply time-of-day color tint to terrain (only above water for better effect)
    if (!isUnderwater || !cameraUnderwater) {
      // Calculate dawn/dusk factor
      var dawnDuskFactor = 0.0;
      if (timeOfDay >= 0.2 && timeOfDay < 0.3) {
        dawnDuskFactor = smoothstep(0.2, 0.25, timeOfDay) * (1.0 - smoothstep(0.25, 0.3, timeOfDay));
      } else if (timeOfDay >= 0.7 && timeOfDay < 0.85) {
        dawnDuskFactor = smoothstep(0.7, 0.75, timeOfDay) * (1.0 - smoothstep(0.75, 0.85, timeOfDay));
      }
      
      // Warm tint at dawn/dusk
      let warmTint = vec3f(1.0, 0.85, 0.7);
      col = mix(col, col * warmTint, dawnDuskFactor * 0.35);
      
      // Cool tint at night
      let coolTint = vec3f(0.7, 0.8, 1.0);
      col = mix(col, col * coolTint, nightFactor * 0.4);
    }
    
    // ============================================
    // RAIN SPLASHES - Concentric ripples on terrain
    // Only visible during rain (skyDarkening > 0.3) and above water
    // ============================================
    if (camera.skyDarkening > 0.3 && !isUnderwater) {
      let rainIntensity = smoothstep(0.3, 0.9, camera.skyDarkening);
      
      // Create multiple splash points using grid-based approach
      let splashGridSize = 2.5; // Size of each splash cell
      let worldXZ = in.worldPos.xz;
      
      var totalSplash = 0.0;
      
      // Check 3x3 grid of cells for nearby splashes
      for (var gx = -1; gx <= 1; gx++) {
        for (var gz = -1; gz <= 1; gz++) {
          let cellCoord = floor(worldXZ / splashGridSize) + vec2f(f32(gx), f32(gz));
          
          // Random offset within cell for splash position
          let cellHash = fract(sin(dot(cellCoord, vec2f(127.1, 311.7))) * 43758.5453);
          let cellHash2 = fract(sin(dot(cellCoord, vec2f(269.5, 183.3))) * 43758.5453);
          
          let splashPos = (cellCoord + vec2f(cellHash * 0.8 + 0.1, cellHash2 * 0.8 + 0.1)) * splashGridSize;
          
          // Distance from this point to the splash center
          let dist = length(worldXZ - splashPos);
          
          // Multiple ripples with different timings per cell
          for (var rippleIdx = 0u; rippleIdx < 3u; rippleIdx++) {
            // Each ripple has different timing offset
            let rippleSeed = cellHash + f32(rippleIdx) * 0.333;
            let rippleInterval = 0.8 + rippleSeed * 0.6; // 0.8-1.4 seconds per ripple
            let ripplePhase = fract(camera.time / rippleInterval + rippleSeed);
            
            // Ripple expands outward over time
            let maxRadius = 0.8 + f32(rippleIdx) * 0.15;
            let currentRadius = ripplePhase * maxRadius;
            
            // How close is this pixel to the current ripple ring?
            let ringDist = abs(dist - currentRadius);
            let ringWidth = 0.04 + ripplePhase * 0.02; // Rings get slightly wider as they expand
            
            // Ring intensity - sharp ring that fades as it expands
            let ringIntensity = smoothstep(ringWidth, ringWidth * 0.3, ringDist);
            let fadeOut = 1.0 - ripplePhase; // Fade as ring expands
            let fadePower = pow(fadeOut, 1.5); // Quick fade
            
            // Inner rings are brighter than outer
            let rippleBrightness = ringIntensity * fadePower * (1.0 - f32(rippleIdx) * 0.25);
            
            totalSplash += rippleBrightness;
          }
          
          // Central splash dot (impact point)
          let impactPhase = fract(camera.time / (0.7 + cellHash * 0.5) + cellHash2);
          if (impactPhase < 0.15) {
            let impactSize = 0.08 * (1.0 - impactPhase / 0.15);
            let impactDist = smoothstep(impactSize, 0.0, dist);
            totalSplash += impactDist * 0.8;
          }
        }
      }
      
      // Apply splash effect - subtle bright spots
      let splashColor = vec3f(0.85, 0.9, 1.0); // Slight blue tint
      col = col + splashColor * totalSplash * rainIntensity * 0.15 * lighting;
    }
    
    return vec4f(col * lighting, 1.0);
  }
`;
