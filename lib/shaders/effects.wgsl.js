/**
 * Effects Shaders - WGSL shaders for visual effects
 * Part of TypeGPU-Project-World modular shader system
 * Includes: underwater, god rays, bubbles, rain, lightning, snow
 */

/**
 * Underwater Post-Processing Shader
 * Full-screen effect for underwater view with fog, blur, and color absorption
 */
export const underwaterShader = `
  struct Underwater {
    cameraPos: vec3f,
    time: f32,
    waterLevel: f32,
    cameraDepth: f32,
    fogDensity: f32,
    fogStart: f32,
    fogEnd: f32,
    tintStrength: f32,
    godRaysIntensity: f32,
    godRaysSpeed: f32,
    godRaysDensity: f32,
    godRaysLength: f32,
    causticsIntensity: f32,
    causticsScale: f32,
    causticsSpeed: f32,
    surfaceWaveStrength: f32,
    surfaceFresnelPower: f32,
    bubblesEnabled: f32,
    bubblesCount: f32,
    bubblesSpeed: f32,
    bubblesSize: f32,
    depthDarkenStart: f32,
    depthDarkenEnd: f32,
    depthDarkenStrength: f32,
    blurRadius: f32,
    fogColor: vec3f,
    _pad1: f32,
    tintColor: vec3f,
    _pad2: f32,
    godRaysColor: vec3f,
    _pad3: f32,
    surfaceColor: vec3f,
    _pad4: f32,
    bubblesColor: vec3f,
    _pad5: f32,
  }
  
  @group(0) @binding(0) var<uniform> u: Underwater;
  @group(0) @binding(1) var sceneTex: texture_2d<f32>;
  @group(0) @binding(2) var sceneSampler: sampler;

  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
  }
  
  // ============================================
  // PERLIN NOISE 3D - For procedural god rays
  // ============================================
  fn mod289_3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  fn mod289_4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  fn permute(x: vec4f) -> vec4f { return mod289_4(((x * 34.0) + 1.0) * x); }
  fn taylorInvSqrt(r: vec4f) -> vec4f { return 1.79284291400159 - 0.85373472095314 * r; }
  fn fade(t: vec3f) -> vec3f { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
  
  fn perlin3d(P: vec3f) -> f32 {
    let Pi0 = floor(P);
    let Pi1 = Pi0 + vec3f(1.0);
    let Pi0m = mod289_3(Pi0);
    let Pi1m = mod289_3(Pi1);
    let Pf0 = fract(P);
    let Pf1 = Pf0 - vec3f(1.0);
    let ix = vec4f(Pi0m.x, Pi1m.x, Pi0m.x, Pi1m.x);
    let iy = vec4f(Pi0m.yy, Pi1m.yy);
    let iz0 = vec4f(Pi0m.z);
    let iz1 = vec4f(Pi1m.z);
    
    let ixy = permute(permute(ix) + iy);
    let ixy0 = permute(ixy + iz0);
    let ixy1 = permute(ixy + iz1);
    
    var gx0 = ixy0 * (1.0 / 7.0);
    var gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
    gx0 = fract(gx0);
    let gz0 = vec4f(0.5) - abs(gx0) - abs(gy0);
    let sz0 = step(gz0, vec4f(0.0));
    gx0 = gx0 - sz0 * (step(vec4f(0.0), gx0) - 0.5);
    gy0 = gy0 - sz0 * (step(vec4f(0.0), gy0) - 0.5);
    
    var gx1 = ixy1 * (1.0 / 7.0);
    var gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
    gx1 = fract(gx1);
    let gz1 = vec4f(0.5) - abs(gx1) - abs(gy1);
    let sz1 = step(gz1, vec4f(0.0));
    gx1 = gx1 - sz1 * (step(vec4f(0.0), gx1) - 0.5);
    gy1 = gy1 - sz1 * (step(vec4f(0.0), gy1) - 0.5);
    
    var g000 = vec3f(gx0.x, gy0.x, gz0.x);
    var g100 = vec3f(gx0.y, gy0.y, gz0.y);
    var g010 = vec3f(gx0.z, gy0.z, gz0.z);
    var g110 = vec3f(gx0.w, gy0.w, gz0.w);
    var g001 = vec3f(gx1.x, gy1.x, gz1.x);
    var g101 = vec3f(gx1.y, gy1.y, gz1.y);
    var g011 = vec3f(gx1.z, gy1.z, gz1.z);
    var g111 = vec3f(gx1.w, gy1.w, gz1.w);
    
    let norm0 = taylorInvSqrt(vec4f(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 = g000 * norm0.x; g010 = g010 * norm0.y; g100 = g100 * norm0.z; g110 = g110 * norm0.w;
    let norm1 = taylorInvSqrt(vec4f(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 = g001 * norm1.x; g011 = g011 * norm1.y; g101 = g101 * norm1.z; g111 = g111 * norm1.w;
    
    let n000 = dot(g000, Pf0);
    let n100 = dot(g100, vec3f(Pf1.x, Pf0.yz));
    let n010 = dot(g010, vec3f(Pf0.x, Pf1.y, Pf0.z));
    let n110 = dot(g110, vec3f(Pf1.xy, Pf0.z));
    let n001 = dot(g001, vec3f(Pf0.xy, Pf1.z));
    let n101 = dot(g101, vec3f(Pf1.x, Pf0.y, Pf1.z));
    let n011 = dot(g011, vec3f(Pf0.x, Pf1.yz));
    let n111 = dot(g111, Pf1);
    
    let fade_xyz = fade(Pf0);
    let n_z = mix(vec4f(n000, n100, n010, n110), vec4f(n001, n101, n011, n111), fade_xyz.z);
    let n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    let n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return n_xyz * 2.2;
  }
  
  // Rotation matrix for diagonal rays
  fn rotateXY(angle: f32) -> mat2x2f {
    return mat2x2f(
      vec2f(cos(angle), sin(angle)),
      vec2f(-sin(angle), cos(angle))
    );
  }

  // Full screen triangle
  @vertex fn vs(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
    var out: VSOut;
    var positions = array<vec2f, 3>(
      vec2f(-1.0, -1.0),
      vec2f(3.0, -1.0),
      vec2f(-1.0, 3.0)
    );
    let pos = positions[vertexIndex];
    out.pos = vec4f(pos, 0.0, 1.0);
    out.uv = (pos + 1.0) * 0.5;
    out.uv.y = 1.0 - out.uv.y;
    return out;
  }

  @fragment fn fs(in: VSOut) -> @location(0) vec4f {
    let uv = in.uv;
    
    // If not underwater (cameraDepth <= 0), just passthrough the scene
    if (u.cameraDepth <= 0.0) {
      return textureSample(sceneTex, sceneSampler, uv);
    }
    
    // Get texture dimensions for proper blur offset
    let texSize = vec2f(textureDimensions(sceneTex));
    let pixelSize = 1.0 / texSize;
    
    // === UNDERWATER BLUR - Configurable via CONFIG.underwater.blurRadius ===
    // Same blur effect regardless of depth for uniform underwater look
    let blurStrength = 1.0; // Always full strength
    let blurRadius = u.blurRadius; // Configurable blur radius in pixels
    
    // 9-sample box blur with depth-based radius
    var sceneColor = vec3f(0.0);
    let offsets = array<vec2f, 9>(
      vec2f(-1.0, -1.0), vec2f(0.0, -1.0), vec2f(1.0, -1.0),
      vec2f(-1.0, 0.0),  vec2f(0.0, 0.0),  vec2f(1.0, 0.0),
      vec2f(-1.0, 1.0),  vec2f(0.0, 1.0),  vec2f(1.0, 1.0)
    );
    
    for (var i = 0; i < 9; i++) {
      let sampleUV = uv + offsets[i] * pixelSize * blurRadius;
      sceneColor += textureSample(sceneTex, sceneSampler, sampleUV).rgb;
    }
    sceneColor /= 9.0;
    
    // Calculate depth factor (0 = surface, 1 = deep)
    let depthFactor = clamp(u.cameraDepth / u.depthDarkenEnd, 0.0, 1.0);
    
    // === UNDERWATER COLOR ABSORPTION ===
    // Water absorbs red light first, then green, blue travels furthest
    let absorption = vec3f(
      1.0 - depthFactor * 0.5,   // Red absorbed quickly
      1.0 - depthFactor * 0.3,   // Green absorbed moderately  
      1.0 - depthFactor * 0.1    // Blue travels far
    );
    sceneColor *= absorption;
    
    // === DEPTH DARKENING ===
    let darkness = smoothstep(u.depthDarkenStart, u.depthDarkenEnd, u.cameraDepth);
    sceneColor *= 1.0 - darkness * u.depthDarkenStrength;
    
    // === UNDERWATER FOG ===
    // Exponential fog based on depth
    let fogAmount = 1.0 - exp(-u.cameraDepth * u.fogDensity * 0.05);
    sceneColor = mix(sceneColor, u.fogColor, fogAmount * 0.5);
    
    // === BLUE TINT OVERLAY ===
    sceneColor = mix(sceneColor, sceneColor + u.tintColor, u.tintStrength * 0.3);
    
    // === VIGNETTE (deeper = stronger) ===
    let vignetteStrength = 0.2 + depthFactor * 0.3;
    let vignette = 1.0 - pow(length(uv - 0.5) * 1.0, 2.0) * vignetteStrength;
    sceneColor *= vignette;
    
    return vec4f(sceneColor, 1.0);
  }
`;

/**
 * Volumetric God Rays Shader
 * 3D light shafts in world space - renders transparent quads following sun direction
 */
export const godRaysShader = `
  struct Camera { viewProjection: mat4x4f, position: vec3f, time: f32, cloudCoverage: f32, starBlur: f32, skyDarkening: f32, lightningFlash: f32, lightningPosX: f32, lightningPosY: f32, dayTime: f32 }
  struct GodRays { 
    waterLevel: f32, 
    intensity: f32, 
    numRays: f32,
    rayWidth: f32,
    rayLength: f32,
    speed: f32,
    _pad: vec2f
  }
  
  @group(0) @binding(0) var<uniform> camera: Camera;
  @group(0) @binding(1) var<uniform> godRays: GodRays;
  
  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) worldPos: vec3f,
    @location(1) uv: vec2f,
    @location(2) rayIndex: f32,
  }
  
  // Perlin noise for ray variation
  fn hash3(p: vec3f) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  
  fn noise3d(p: vec3f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    
    return mix(
      mix(mix(hash3(i + vec3f(0,0,0)), hash3(i + vec3f(1,0,0)), u.x),
          mix(hash3(i + vec3f(0,1,0)), hash3(i + vec3f(1,1,0)), u.x), u.y),
      mix(mix(hash3(i + vec3f(0,0,1)), hash3(i + vec3f(1,0,1)), u.x),
          mix(hash3(i + vec3f(0,1,1)), hash3(i + vec3f(1,1,1)), u.x), u.y),
      u.z
    );
  }
  
  @vertex fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VSOut {
    var out: VSOut;
    
    // Each ray is a quad (6 vertices = 2 triangles)
    let quadVertex = vertexIndex % 6u;
    let rayIndex = instanceIndex;
    
    // Quad vertices (local space, vertical plane facing camera)
    var quadPos: array<vec2f, 6> = array<vec2f, 6>(
      vec2f(-0.5, 0.0), vec2f(0.5, 0.0), vec2f(0.5, 1.0),
      vec2f(-0.5, 0.0), vec2f(0.5, 1.0), vec2f(-0.5, 1.0)
    );
    var quadUV: array<vec2f, 6> = array<vec2f, 6>(
      vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
      vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
    );
    
    let localPos = quadPos[quadVertex];
    out.uv = quadUV[quadVertex];
    out.rayIndex = f32(rayIndex);
    
    // Sun direction (diagonal from above-right)
    let sunDir = normalize(vec3f(0.4, -0.8, 0.3));
    
    // Create right vector for billboard (perpendicular to sun and up)
    let worldUp = vec3f(0.0, 1.0, 0.0);
    let right = normalize(cross(sunDir, worldUp));
    
    // Random offset for each ray based on instance
    let seed = f32(rayIndex) * 127.1;
    let baseAngle = fract(sin(seed) * 43758.5453) * 6.28318; // Random angle
    let radius = (fract(sin(seed * 1.7) * 22578.1459)) * 100.0 + 5.0; // 5-105m from camera
    let randomPhase = fract(sin(seed * 2.3) * 12345.6);
    
    // Aurora-like slow wave motion - angle oscillates over time
    let waveSpeed1 = 0.15 + randomPhase * 0.1;
    let waveSpeed2 = 0.08 + randomPhase * 0.05;
    let angleWave = sin(camera.time * waveSpeed1 + randomPhase * 6.28) * 0.3;
    let radiusWave = sin(camera.time * waveSpeed2 + randomPhase * 3.14) * 10.0;
    
    let animatedAngle = baseAngle + angleWave;
    let animatedRadius = radius + radiusWave;
    
    // Distribute rays in a circle around camera with flowing motion
    let randomX = cos(animatedAngle) * animatedRadius;
    let randomZ = sin(animatedAngle) * animatedRadius;
    
    // Gentle breathing motion - rays expand and contract subtly
    let breathe = sin(camera.time * 0.2 + randomPhase * 6.28) * 0.1 + 1.0;
    
    // Slow drift like underwater currents
    let driftX = sin(camera.time * 0.05 + seed * 0.1) * 8.0;
    let driftZ = cos(camera.time * 0.04 + seed * 0.15) * 8.0;
    
    let rayBaseX = camera.position.x + randomX * breathe + driftX;
    let rayBaseZ = camera.position.z + randomZ * breathe + driftZ;
    let rayBaseY = godRays.waterLevel - 2.0;
    
    // Vertical sway - rays gently tilt as if moved by water
    let timeOffset = camera.time * godRays.speed + randomPhase * 100.0;
    let animX = sin(timeOffset * 0.08 + seed) * 3.0;
    let animZ = cos(timeOffset * 0.06 + seed * 0.7) * 3.0;
    
    // Build world position
    let rayOrigin = vec3f(rayBaseX + animX, rayBaseY, rayBaseZ + animZ);
    
    // Scale the quad
    let width = godRays.rayWidth * (0.5 + fract(sin(seed * 3.1) * 9876.5) * 1.0);
    let length = godRays.rayLength * (0.6 + fract(sin(seed * 4.2) * 5678.9) * 0.8);
    
    // Position vertex along ray direction
    var worldPos = rayOrigin;
    worldPos += right * localPos.x * width;
    worldPos += sunDir * localPos.y * length; // Extend along sun direction
    
    out.worldPos = worldPos;
    out.pos = camera.viewProjection * vec4f(worldPos, 1.0);
    
    return out;
  }
  
  @fragment fn fs(in: VSOut) -> @location(0) vec4f {
    // Only render if underwater
    if (in.worldPos.y > godRays.waterLevel) {
      discard;
    }
    
    // Distance from water surface
    let depthInWater = godRays.waterLevel - in.worldPos.y;
    
    // Fade near edges of quad
    let edgeFadeX = 1.0 - pow(abs(in.uv.x - 0.5) * 2.0, 2.0);
    let edgeFadeY = 1.0 - pow(abs(in.uv.y - 0.5) * 2.0, 1.5);
    let edgeFade = edgeFadeX * edgeFadeY;
    
    // Fade with depth (rays are brighter near surface)
    let depthFade = exp(-depthInWater * 0.04);
    
    // Noise variation along the ray with aurora-like pulsing
    let noiseCoord = vec3f(in.worldPos.x * 0.1, in.worldPos.y * 0.2, camera.time * 0.3);
    let noiseVal = noise3d(noiseCoord) * 0.5 + 0.5;
    
    // Aurora pulsing - intensity waves along the ray
    let pulse1 = sin(in.uv.y * 3.14 + camera.time * 0.5 + in.rayIndex * 0.5) * 0.3 + 0.7;
    let pulse2 = sin(in.uv.y * 6.28 + camera.time * 0.8 - in.rayIndex * 0.3) * 0.2 + 0.8;
    let auroraPulse = pulse1 * pulse2;
    
    // Final intensity with aurora effect
    var intensity = edgeFade * depthFade * noiseVal * godRays.intensity * auroraPulse;
    intensity = pow(intensity, 1.0);
    
    // Ray color (bright cyan-white)
    let rayColor = vec3f(0.7, 0.9, 1.0);
    
    // Distance fade (rays far from camera are less visible)
    let distToCamera = length(in.worldPos - camera.position);
    let distFade = smoothstep(100.0, 8.0, distToCamera);
    intensity *= distFade;
    
    return vec4f(rayColor * intensity, intensity * 0.5);
  }
`;

/**
 * Underwater Bubbles Shader
 * Particles rising from coral/terrain - beautiful translucent bubbles
 */
export const bubblesShader = `
  struct Camera { viewProjection: mat4x4f, position: vec3f, time: f32, cloudCoverage: f32, starBlur: f32, skyDarkening: f32, lightningFlash: f32, lightningPosX: f32, lightningPosY: f32, dayTime: f32 }
  struct Bubbles { 
    waterLevel: f32, 
    numBubbles: f32,
    minSize: f32,
    maxSize: f32,
    riseSpeed: f32,
    wobbleSpeed: f32,
    wobbleAmount: f32,
    spawnRadius: f32
  }
  
  @group(0) @binding(0) var<uniform> camera: Camera;
  @group(0) @binding(1) var<uniform> bubbles: Bubbles;
  
  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) worldPos: vec3f,
    @location(1) uv: vec2f,
    @location(2) bubbleSize: f32,
    @location(3) bubblePhase: f32,
  }
  
  // Hash for random values
  fn hash(n: f32) -> f32 {
    return fract(sin(n) * 43758.5453);
  }
  
  @vertex fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VSOut {
    var out: VSOut;
    
    let quadVertex = vertexIndex % 6u;
    let bubbleIndex = instanceIndex;
    let seed = f32(bubbleIndex);
    
    // Quad vertices for billboard
    var quadPos: array<vec2f, 6> = array<vec2f, 6>(
      vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5),
      vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(-0.5, 0.5)
    );
    var quadUV: array<vec2f, 6> = array<vec2f, 6>(
      vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
      vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
    );
    
    let localPos = quadPos[quadVertex];
    out.uv = quadUV[quadVertex];
    
    // Random spawn point (fixed location like coral)
    let spawnAngle = hash(seed * 127.1) * 6.28318;
    let spawnDist = hash(seed * 311.7) * bubbles.spawnRadius;
    let spawnX = camera.position.x + cos(spawnAngle) * spawnDist;
    let spawnZ = camera.position.z + sin(spawnAngle) * spawnDist;
    
    // Ground level varies (terrain simulation)
    let terrainHeight = -5.0 + hash(seed * 523.3) * 10.0;
    
    // Bubble size - mix of tiny, small, medium, large
    let sizeRand = hash(seed * 789.1);
    var bubbleSize: f32;
    if (sizeRand < 0.5) {
      bubbleSize = bubbles.minSize * (0.3 + sizeRand * 0.4); // Tiny micro-bubbles (50%)
    } else if (sizeRand < 0.8) {
      bubbleSize = bubbles.minSize + (bubbles.maxSize - bubbles.minSize) * 0.3; // Small (30%)
    } else if (sizeRand < 0.95) {
      bubbleSize = bubbles.minSize + (bubbles.maxSize - bubbles.minSize) * 0.6; // Medium (15%)
    } else {
      bubbleSize = bubbles.maxSize; // Large (5%)
    }
    out.bubbleSize = bubbleSize;
    
    // Animation phase - each bubble has its own cycle
    let cycleTime = 8.0 + hash(seed * 456.7) * 12.0; // 8-20 seconds per cycle
    let phase = hash(seed * 234.5);
    let cycleProgress = fract(camera.time / cycleTime + phase);
    out.bubblePhase = phase;
    
    // Vertical position - rises from terrain to water surface
    let maxRise = bubbles.waterLevel - terrainHeight;
    let currentY = terrainHeight + cycleProgress * maxRise;
    
    // Horizontal wobble as bubble rises
    let wobbleX = sin(camera.time * bubbles.wobbleSpeed + seed * 10.0) * bubbles.wobbleAmount * cycleProgress;
    let wobbleZ = cos(camera.time * bubbles.wobbleSpeed * 0.7 + seed * 7.0) * bubbles.wobbleAmount * 0.7 * cycleProgress;
    
    // Slight spiral motion
    let spiralAngle = cycleProgress * 6.28 + seed;
    let spiralRadius = cycleProgress * 0.5;
    let spiralX = cos(spiralAngle) * spiralRadius;
    let spiralZ = sin(spiralAngle) * spiralRadius;
    
    // Final bubble center position
    let bubbleCenter = vec3f(
      spawnX + wobbleX + spiralX,
      currentY,
      spawnZ + wobbleZ + spiralZ
    );
    
    // Billboard facing camera
    let toCamera = normalize(camera.position - bubbleCenter);
    let worldUp = vec3f(0.0, 1.0, 0.0);
    let right = normalize(cross(worldUp, toCamera));
    let up = normalize(cross(toCamera, right));
    
    // Build world position
    var worldPos = bubbleCenter;
    worldPos += right * localPos.x * bubbleSize;
    worldPos += up * localPos.y * bubbleSize;
    
    out.worldPos = worldPos;
    out.pos = camera.viewProjection * vec4f(worldPos, 1.0);
    
    return out;
  }
  
  @fragment fn fs(in: VSOut) -> @location(0) vec4f {
    // Only render underwater
    if (in.worldPos.y > bubbles.waterLevel) {
      discard;
    }
    
    // Distance from center of bubble (0 = center, 1 = edge)
    let dist = length(in.uv - 0.5) * 2.0;
    
    // Discard outside circle
    if (dist > 1.0) {
      discard;
    }
    
    // Bubble appearance - translucent sphere with rim highlight
    // Inner part is mostly transparent
    let innerAlpha = 0.05;
    
    // Rim gets brighter (fresnel-like effect)
    let rimStart = 0.6;
    let rimStrength = smoothstep(rimStart, 1.0, dist);
    let rimAlpha = rimStrength * 0.4;
    
    // Specular highlight (light reflection)
    let highlightPos = vec2f(-0.25, 0.3); // Upper-left highlight
    let highlightDist = length(in.uv - 0.5 - highlightPos);
    let highlight = exp(-highlightDist * highlightDist * 30.0) * 0.8;
    
    // Secondary smaller highlight
    let highlight2Pos = vec2f(0.15, -0.2);
    let highlight2Dist = length(in.uv - 0.5 - highlight2Pos);
    let highlight2 = exp(-highlight2Dist * highlight2Dist * 60.0) * 0.3;
    
    // Bubble color - slightly tinted by water, mostly white/cyan
    let baseColor = vec3f(0.85, 0.95, 1.0);
    let rimColor = vec3f(0.7, 0.9, 1.0);
    
    var color = mix(baseColor, rimColor, rimStrength);
    color += vec3f(1.0) * (highlight + highlight2); // White highlights
    
    // Alpha combines inner transparency + rim + highlights
    var alpha = innerAlpha + rimAlpha + (highlight + highlight2) * 0.5;
    
    // Smaller bubbles are more transparent
    let sizeAlphaFactor = 0.5 + (in.bubbleSize / bubbles.maxSize) * 0.5;
    alpha *= sizeAlphaFactor;
    
    // Fade with distance from camera
    let distToCamera = length(in.worldPos - camera.position);
    let distFade = smoothstep(80.0, 10.0, distToCamera);
    alpha *= distFade;
    
    // Subtle rainbow iridescence on rim
    let iridescence = sin(dist * 15.0 + camera.time * 2.0 + in.bubblePhase * 10.0) * 0.1;
    color.r += iridescence * rimStrength;
    color.b -= iridescence * rimStrength * 0.5;
    
    return vec4f(color, alpha);
  }
`;

/**
 * Rain Shader - Volumetric rain drops in world space
 * Continuous random rain, no synchronized bursts
 */
export const rainShader = `
  struct Camera { viewProjection: mat4x4f, position: vec3f, time: f32, cloudCoverage: f32, starBlur: f32, skyDarkening: f32, lightningFlash: f32, lightningPosX: f32, lightningPosY: f32, dayTime: f32 }
  struct Rain { 
    numParticles: f32,
    speed: f32,
    length: f32,
    width: f32,
    windStrength: f32,
    spawnRadius: f32,
    spawnHeight: f32,
    intensity: f32,
    color: vec3f,
    opacity: f32,
    lightningFlash: f32,
    _pad: vec3f,
  }
  
  @group(0) @binding(0) var<uniform> camera: Camera;
  @group(0) @binding(1) var<uniform> rain: Rain;
  
  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
    @location(1) alpha: f32,
    @location(2) dist: f32,
  }
  
  fn hash(n: f32) -> f32 {
    return fract(sin(n) * 43758.5453);
  }
  
  fn hash2(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
  }
  
  @vertex fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VSOut {
    var out: VSOut;
    
    let quadVertex = vertexIndex % 6u;
    let dropIndex = instanceIndex;
    let seed = f32(dropIndex);
    
    // Quad vertices for rain drop
    var quadPos: array<vec2f, 6> = array<vec2f, 6>(
      vec2f(-0.5, 0.0), vec2f(0.5, 0.0), vec2f(0.5, 1.0),
      vec2f(-0.5, 0.0), vec2f(0.5, 1.0), vec2f(-0.5, 1.0)
    );
    var quadUV: array<vec2f, 6> = array<vec2f, 6>(
      vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
      vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
    );
    
    out.uv = quadUV[quadVertex];
    
    // ============================================
    // CONTINUOUS RAIN - Evenly distributed, no bursts
    // Uses golden ratio for even angular distribution
    // Centered ahead of camera (where avatar is in 3rd person view)
    // ============================================
    
    // Extract camera forward direction from viewProjection matrix
    let camForwardX = -camera.viewProjection[0][2];
    let camForwardZ = -camera.viewProjection[2][2];
    let camForwardLen = sqrt(camForwardX * camForwardX + camForwardZ * camForwardZ);
    var normForwardX = 0.0;
    var normForwardZ = 1.0;
    if (camForwardLen > 0.01) {
      normForwardX = camForwardX / camForwardLen;
      normForwardZ = camForwardZ / camForwardLen;
    }
    
    // Golden ratio based distribution - prevents clustering
    let goldenAngle = 2.399963;  // radians, golden angle
    let angle = f32(dropIndex) * goldenAngle;
    
    // Distribute radius evenly using square root for uniform area coverage
    let radiusSeed = hash(seed * 127.1);
    let radius = sqrt(radiusSeed) * rain.spawnRadius;
    
    // Center rain AHEAD of camera (towards where avatar is in 3rd person)
    let forwardOffset = 10.0;
    let centerX = camera.position.x + normForwardX * forwardOffset;
    let centerZ = camera.position.z + normForwardZ * forwardOffset;
    
    // Position in XZ plane - centered ahead of camera
    let baseX = centerX + cos(angle) * radius;
    let baseZ = centerZ + sin(angle) * radius;
    
    // Each drop has completely independent fall timing
    let h1 = hash(seed * 173.7);
    let h2 = hash(seed * 259.3);
    let h3 = hash(seed * 347.9);
    
    // Speed variation per drop (0.8 to 1.2x)
    let speedVar = 0.8 + h1 * 0.4;
    let dropSpeed = rain.speed * speedVar;
    
    // Extended fall range - from high above to below camera
    let totalFallHeight = rain.spawnHeight * 2.0;
    let cycleTime = totalFallHeight / dropSpeed;
    let startPhase = h2;
    
    // Current position in fall cycle
    let cycleProgress = fract(camera.time / cycleTime + startPhase);
    
    // Y position: from spawnHeight above camera to spawnHeight below
    let topY = camera.position.y + rain.spawnHeight;
    let bottomY = camera.position.y - rain.spawnHeight;
    let worldY = mix(topY, bottomY, cycleProgress);
    
    // Size variation
    let sizeVar = 0.6 + h3 * 0.8;
    
    // Subtle wind
    let windPhase = hash(seed * 419.1);
    let windX = sin(camera.time * 0.3 + windPhase * 20.0) * rain.windStrength * 0.3;
    let windZ = cos(camera.time * 0.2 + windPhase * 15.0) * rain.windStrength * 0.15;
    
    // Final world position
    let dropPos = vec3f(baseX + windX, worldY, baseZ + windZ);
    
    // Distance from camera
    let distToCamera = length(dropPos - camera.position);
    out.dist = distToCamera;
    
    // Drop dimensions - longer streaks for rain effect
    let dropLength = rain.length * sizeVar;
    let dropWidth = rain.width * sizeVar;
    
    // Billboard facing camera
    let camDir = camera.position.xz - dropPos.xz;
    let camDirLen = length(camDir);
    var rightDir = vec3f(1.0, 0.0, 0.0);
    if (camDirLen > 0.01) {
      let normDir = camDir / camDirLen;
      rightDir = vec3f(-normDir.y, 0.0, normDir.x);
    }
    
    // Fall direction (mostly down, slight wind tilt)
    let fallDir = normalize(vec3f(windX * 0.05, -1.0, windZ * 0.05));
    
    var worldPos = dropPos;
    worldPos += rightDir * quadPos[quadVertex].x * dropWidth;
    worldPos += fallDir * quadPos[quadVertex].y * dropLength;
    
    out.pos = camera.viewProjection * vec4f(worldPos, 1.0);
    
    // Alpha calculations for smooth visibility
    let nearFade = smoothstep(1.0, 4.0, distToCamera);
    let farFade = 1.0 - smoothstep(rain.spawnRadius * 0.5, rain.spawnRadius * 0.95, distToCamera);
    let heightFade = smoothstep(camera.position.y - rain.spawnHeight * 0.8, camera.position.y - rain.spawnHeight * 0.3, worldY);
    let topFade = smoothstep(camera.position.y + rain.spawnHeight, camera.position.y + rain.spawnHeight * 0.7, worldY);
    
    out.alpha = rain.opacity * rain.intensity * nearFade * farFade * heightFade * topFade * sizeVar;
    
    return out;
  }
  
  @fragment fn fs(in: VSOut) -> @location(0) vec4f {
    // Elongated drop shape - narrower for more realistic rain streaks
    let centerX = (in.uv.x - 0.5) * 4.0;
    let centerY = (in.uv.y - 0.5) * 1.0;
    let centerDist = length(vec2f(centerX, centerY));
    
    // Soft streak shape
    let shape = smoothstep(1.0, 0.1, centerDist);
    
    // Taper at top and bottom
    let taper = smoothstep(0.0, 0.1, in.uv.y) * smoothstep(1.0, 0.9, in.uv.y);
    
    let alpha = shape * taper * in.alpha;
    
    // Rain color - slightly brighter, semi-transparent white
    var color = rain.color;
    
    return vec4f(color, alpha);
  }
`;

/**
 * Lightning Shader - Volumetric lightning bolts
 * Creates incandescent, glowing bolts with blur effect
 * Multiple bolts in different directions hitting the ground
 */
export const lightningShader = `
  struct Camera { viewProjection: mat4x4f, position: vec3f, time: f32, cloudCoverage: f32, starBlur: f32, skyDarkening: f32, lightningFlash: f32, lightningPosX: f32, lightningPosY: f32, dayTime: f32 }
  struct Lightning { 
    isActive: f32,
    startTime: f32,
    boltDuration: f32,
    flashIntensity: f32,
    startX: f32,
    startZ: f32,
    seed: f32,
    numBranches: f32,
  }
  
  @group(0) @binding(0) var<uniform> camera: Camera;
  @group(0) @binding(1) var<uniform> lightning: Lightning;
  
  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
    @location(1) boltIndex: f32,
    @location(2) branchDepth: f32,
    @location(3) worldPos: vec3f,
    @location(4) glowLayer: f32,
  }
  
  fn hash(n: f32) -> f32 {
    return fract(sin(n) * 43758.5453);
  }
  
  fn hash2(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
  }
  
  @vertex fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VSOut {
    var out: VSOut;
    
    // Not active - push offscreen
    if (lightning.isActive < 0.5) {
      out.pos = vec4f(0.0, 0.0, -10.0, 1.0);
      return out;
    }
    
    // Multiple glow layers per segment for volumetric effect
    let glowLayers = 3u;
    let segmentsPerBolt = 16u;
    let totalPerBolt = segmentsPerBolt * glowLayers;
    
    let boltIndex = instanceIndex / totalPerBolt;
    let withinBolt = instanceIndex % totalPerBolt;
    let segInBolt = withinBolt / glowLayers;
    let glowLayer = withinBolt % glowLayers;
    
    out.boltIndex = f32(boltIndex);
    out.glowLayer = f32(glowLayer);
    
    let quadVertex = vertexIndex % 6u;
    
    // Quad vertices
    var quadPos: array<vec2f, 6> = array<vec2f, 6>(
      vec2f(-0.5, 0.0), vec2f(0.5, 0.0), vec2f(0.5, 1.0),
      vec2f(-0.5, 0.0), vec2f(0.5, 1.0), vec2f(-0.5, 1.0)
    );
    var quadUV: array<vec2f, 6> = array<vec2f, 6>(
      vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
      vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
    );
    
    out.uv = quadUV[quadVertex];
    
    // Each bolt has different angle and position
    let boltSeed = lightning.seed + f32(boltIndex) * 777.7;
    let boltAngle = hash(boltSeed) * 6.28318;
    let boltDist = 30.0 + hash(boltSeed * 1.3) * 150.0;
    
    // Bolt strike position
    let strikeX = lightning.startX + cos(boltAngle) * boltDist * (hash(boltSeed * 2.1) - 0.3);
    let strikeZ = lightning.startZ + sin(boltAngle) * boltDist * (hash(boltSeed * 3.7) - 0.3);
    
    // Branch depth - main bolt vs sub-branches
    let isBranch = boltIndex >= 2u;
    out.branchDepth = select(0.0, 1.0 + f32(boltIndex - 2u) * 0.3, isBranch);
    
    // Lightning path from clouds to ground
    let cloudHeight = camera.position.y + 120.0 + hash(boltSeed * 4.5) * 40.0;
    let groundHeight = camera.position.y - 30.0;
    let segHeight = (cloudHeight - groundHeight) / f32(segmentsPerBolt);
    
    var segStartY = cloudHeight - f32(segInBolt) * segHeight;
    var segEndY = segStartY - segHeight;
    
    // Jagged lightning path with electrical randomness
    var offsetX = 0.0;
    var offsetZ = 0.0;
    let jitterScale = select(12.0, 6.0, isBranch);
    
    for (var i = 0u; i <= segInBolt; i++) {
      let jSeed = boltSeed + f32(i) * 13.7;
      let midFactor = sin(f32(i) / f32(segmentsPerBolt) * 3.14159);
      offsetX += (hash(jSeed) - 0.5) * jitterScale * midFactor;
      offsetZ += (hash(jSeed * 2.3) - 0.5) * jitterScale * 0.7 * midFactor;
    }
    
    // Branches diverge from main bolt
    if (isBranch) {
      let branchSeed = boltSeed + f32(boltIndex) * 123.4;
      let branchStart = u32(hash(branchSeed) * 10.0) + 3u;
      if (segInBolt < branchStart) {
        out.pos = vec4f(0.0, 0.0, -10.0, 1.0);
        return out;
      }
      let branchAngle = (hash(branchSeed * 5.6) - 0.5) * 1.2;
      offsetX += sin(branchAngle) * f32(segInBolt - branchStart) * 4.0;
      offsetZ += cos(branchAngle) * f32(segInBolt - branchStart) * 2.0;
    }
    
    let boltX = strikeX + offsetX;
    let boltZ = strikeZ + offsetZ;
    
    // Segment endpoints
    let segStart = vec3f(boltX, segStartY, boltZ);
    let nextJSeed = boltSeed + f32(segInBolt + 1u) * 13.7;
    let nextMidFactor = sin(f32(segInBolt + 1u) / f32(segmentsPerBolt) * 3.14159);
    let nextOffsetX = offsetX + (hash(nextJSeed) - 0.5) * jitterScale * nextMidFactor;
    let nextOffsetZ = offsetZ + (hash(nextJSeed * 2.3) - 0.5) * jitterScale * 0.7 * nextMidFactor;
    let segEnd = vec3f(strikeX + nextOffsetX, segEndY, strikeZ + nextOffsetZ);
    
    // Billboard towards camera
    let segDir = normalize(segEnd - segStart);
    let toCamera = normalize(camera.position - (segStart + segEnd) * 0.5);
    var right = normalize(cross(segDir, toCamera));
    if (length(right) < 0.01) {
      right = vec3f(1.0, 0.0, 0.0);
    }
    
    // Volumetric width - multiple layers with increasing size for glow
    let coreWidth = select(3.0, 1.5, isBranch);
    let layerMultiplier = 1.0 + f32(glowLayer) * 2.5;
    var width = coreWidth * layerMultiplier;
    
    // Taper towards ground impact point
    let taperFactor = 1.0 - pow(f32(segInBolt) / f32(segmentsPerBolt), 0.5) * 0.4;
    width *= taperFactor;
    
    var worldPos = mix(segStart, segEnd, quadPos[quadVertex].y);
    worldPos += right * quadPos[quadVertex].x * width;
    
    out.worldPos = worldPos;
    out.pos = camera.viewProjection * vec4f(worldPos, 1.0);
    
    return out;
  }
  
  @fragment fn fs(in: VSOut) -> @location(0) vec4f {
    if (lightning.isActive < 0.5) {
      discard;
    }
    
    // Time-based fade
    let elapsed = camera.time - lightning.startTime;
    let fadeTime = lightning.boltDuration;
    
    // Quick flash in, slower fade out
    let fadeIn = smoothstep(0.0, 0.02, elapsed);
    let fadeOut = 1.0 - smoothstep(fadeTime * 0.3, fadeTime, elapsed);
    let fade = fadeIn * fadeOut;
    
    // Glow layer determines opacity and blur
    let isCore = in.glowLayer < 0.5;
    let glowFactor = 1.0 / (1.0 + in.glowLayer * 0.8);
    
    // Edge softness
    let edgeDist = abs(in.uv.x - 0.5) * 2.0;
    let softness = select(0.3 + in.glowLayer * 0.25, 0.1, isCore);
    let edgeFade = smoothstep(1.0, softness, edgeDist);
    
    // Incandescent core - super bright white-blue
    let coreColor = vec3f(1.0, 1.0, 1.0);
    let glowColor = vec3f(0.4, 0.6, 1.0);
    let hotColor = vec3f(0.8, 0.5, 1.0);
    
    // Color based on layer
    var color: vec3f;
    if (isCore) {
      color = coreColor * 3.0;
    } else if (in.glowLayer < 1.5) {
      color = mix(coreColor, hotColor, edgeDist) * 1.5;
    } else {
      color = glowColor;
    }
    
    // Branch fade
    let branchFade = 1.0 / (1.0 + in.branchDepth * 0.4);
    
    // Electric flicker effect
    let flicker = 0.85 + 0.15 * sin(camera.time * 60.0 + in.boltIndex * 7.0);
    
    // Final alpha with all factors
    var alpha = edgeFade * fade * branchFade * glowFactor * flicker;
    
    // Boost core brightness significantly
    if (isCore) {
      alpha *= 2.5;
      color *= 1.5;
    }
    
    return vec4f(color * alpha, alpha);
  }
`;

/**
 * Snow Shader - Soft falling snowflakes
 * Creates gentle, wobbling snow particles
 */
export const snowShader = `
  struct Camera { viewProjection: mat4x4f, position: vec3f, time: f32, cloudCoverage: f32, starBlur: f32, skyDarkening: f32, lightningFlash: f32, lightningPosX: f32, lightningPosY: f32, dayTime: f32 }
  struct Snow { 
    numParticles: f32,
    speed: f32,
    wobbleSpeed: f32,
    wobbleAmount: f32,
    minSize: f32,
    maxSize: f32,
    spawnRadius: f32,
    spawnHeight: f32,
    color: vec3f,
    opacity: f32,
  }
  
  @group(0) @binding(0) var<uniform> camera: Camera;
  @group(0) @binding(1) var<uniform> snow: Snow;
  
  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) worldPos: vec3f,
    @location(1) uv: vec2f,
    @location(2) size: f32,
    @location(3) alpha: f32,
  }
  
  fn hash(n: f32) -> f32 {
    return fract(sin(n) * 43758.5453);
  }
  
  @vertex fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VSOut {
    var out: VSOut;
    
    let quadVertex = vertexIndex % 6u;
    let flakeIndex = instanceIndex;
    let seed = f32(flakeIndex);
    
    // Billboard quad
    var quadPos: array<vec2f, 6> = array<vec2f, 6>(
      vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5),
      vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(-0.5, 0.5)
    );
    var quadUV: array<vec2f, 6> = array<vec2f, 6>(
      vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
      vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
    );
    
    let localPos = quadPos[quadVertex];
    out.uv = quadUV[quadVertex];
    
    // Random spawn position
    let angle = hash(seed * 127.1) * 6.28318;
    let radius = sqrt(hash(seed * 311.7)) * snow.spawnRadius;
    let baseX = camera.position.x + cos(angle) * radius;
    let baseZ = camera.position.z + sin(angle) * radius;
    
    // Fall animation with looping
    let fallCycle = snow.spawnHeight + 30.0;
    let phase = hash(seed * 789.3);
    let fallProgress = fract(camera.time * snow.speed / fallCycle + phase);
    let baseY = camera.position.y + snow.spawnHeight - fallProgress * fallCycle;
    
    // Wobble side to side as it falls
    let wobblePhase = hash(seed * 456.7) * 6.28;
    let wobbleX = sin(camera.time * snow.wobbleSpeed + wobblePhase) * snow.wobbleAmount;
    let wobbleZ = cos(camera.time * snow.wobbleSpeed * 0.7 + wobblePhase + 1.0) * snow.wobbleAmount * 0.7;
    
    // Gentle spiral
    let spiralAngle = fallProgress * 3.14 + seed;
    let spiralRadius = sin(fallProgress * 3.14) * 1.5;
    let spiralX = cos(spiralAngle) * spiralRadius;
    let spiralZ = sin(spiralAngle) * spiralRadius;
    
    let flakePos = vec3f(baseX + wobbleX + spiralX, baseY, baseZ + wobbleZ + spiralZ);
    
    // Size variation
    let sizeRand = hash(seed * 234.5);
    var flakeSize: f32;
    if (sizeRand < 0.6) {
      flakeSize = snow.minSize + sizeRand * (snow.maxSize - snow.minSize) * 0.3;
    } else if (sizeRand < 0.9) {
      flakeSize = snow.minSize + (snow.maxSize - snow.minSize) * 0.5;
    } else {
      flakeSize = snow.maxSize;
    }
    out.size = flakeSize;
    
    // Billboard facing camera
    let toCamera = normalize(camera.position - flakePos);
    let worldUp = vec3f(0.0, 1.0, 0.0);
    let right = normalize(cross(worldUp, toCamera));
    let up = normalize(cross(toCamera, right));
    
    var worldPos = flakePos;
    worldPos += right * localPos.x * flakeSize;
    worldPos += up * localPos.y * flakeSize;
    
    out.worldPos = worldPos;
    out.pos = camera.viewProjection * vec4f(worldPos, 1.0);
    
    // Fade with distance
    let distToCamera = length(worldPos - camera.position);
    let distFade = smoothstep(snow.spawnRadius * 1.2, snow.spawnRadius * 0.2, distToCamera);
    out.alpha = snow.opacity * distFade;
    
    return out;
  }
  
  @fragment fn fs(in: VSOut) -> @location(0) vec4f {
    // Circular snowflake shape with soft edge
    let dist = length(in.uv - 0.5) * 2.0;
    if (dist > 1.0) {
      discard;
    }
    
    // Soft circular gradient
    let softEdge = 1.0 - smoothstep(0.3, 1.0, dist);
    
    // Subtle sparkle
    let sparkle = pow(1.0 - dist, 3.0) * 0.3;
    
    var color = snow.color;
    color += vec3f(sparkle);
    
    let alpha = softEdge * in.alpha;
    
    return vec4f(color, alpha);
  }
`;
