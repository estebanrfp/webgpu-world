/**
 * Ocean Shader Module - WGSL
 * 
 * Realistic ocean rendering system with:
 * - Gerstner waves for calm water surface movement
 * - Multi-layer water bump mapping for realistic surface detail
 * - Depth-based color blending (shallow/deep water)
 * - Shoreline foam with animated flow patterns
 * - Wave crests foam generation
 * - Subsurface scattering (SSS) for light penetration
 * - Caustics effects in shallow water
 * - Fresnel-based reflections
 * - Star and moon reflections at night
 * - Cloud reflections with procedural FBM
 * - Avatar reflection silhouette
 * - Underwater view mode (viewing from below):
 *   - Snell's window effect
 *   - Caustics visible from below
 *   - Rising bubbles
 *   - Sky/sun/moon/stars visible through surface
 * - Day/night cycle integration
 * 
 * Uniforms:
 * - Camera struct: viewProjection, position, time, cloudCoverage, etc.
 * - Ocean struct: colors, depths, foam, lighting, SSS, caustics, etc.
 * - waterBumpTex: Normal map texture for water surface
 * - waterSampler: Texture sampler
 * 
 * Helper functions:
 * - hash, smoothNoise: Procedural noise generation
 * - getTerrainHeight: Terrain height for depth calculation
 * - getNightFactor: Day/night cycle timing
 * - gerstnerWave: Physics-based wave simulation
 * - foamNoise, waveCrests: Foam pattern generation
 */

export const oceanShader = `
      struct Camera { viewProjection: mat4x4f, position: vec3f, time: f32, cloudCoverage: f32, starBlur: f32, skyDarkening: f32, lightningFlash: f32, lightningPosX: f32, lightningPosY: f32 }
      struct Ocean { 
        model: mat4x4f,
        deepColor: vec3f, waterLevel: f32,
        shallowColor: vec3f, time: f32,
        underwaterTint: vec3f, deepDepth: f32,
        skyReflection: vec3f, shallowDepth: f32,
        foamColor: vec3f, veryShallowDepth: f32,
        sunColor: vec3f, foamDepthMax: f32,
        sssColor: vec3f, sssStrength: f32,
        causticsColor: vec3f, causticsIntensity: f32,
        baseAlphaMin: f32, baseAlphaMax: f32, depthAlphaRange: f32, shallowAlphaBoost: f32,
        distortionStrength: f32, distortionScale: f32, distortionSpeed: f32, distortionWorldScale: f32,
        causticsScale: f32, causticsSpeed: f32,
        fresnelF0: f32, fresnelPower: f32,
        sunDir: vec3f, skyReflectionStr: f32,
        ambientLight: f32, diffuseLight: f32, lightBoost: f32, foamLightBoost: f32,
        specPower: f32, specStrength: f32, sparklePower: f32, sparkleStrength: f32,
        foamThreshold: f32, foamEdgeStart: f32, foamBandThreshold: f32, foamEdgeStrength: f32,
        foamBandStrength: f32, foamAlphaBlend: f32,
        sssShallowBoost: f32, sssPower: f32,
        underwaterTintStr: f32, _pad: f32,
        avatarPos: vec3f, avatarHeight: f32,
      }
      @group(0) @binding(0) var<uniform> camera: Camera;
      @group(0) @binding(1) var<uniform> o: Ocean;
      @group(0) @binding(2) var waterBumpTex: texture_2d<f32>;
      @group(0) @binding(3) var waterSampler: sampler;

      struct VSIn { @location(0) pos: vec3f, @location(1) uv: vec2f }
      struct VSOut { 
        @builtin(position) pos: vec4f, 
        @location(0) worldPos: vec3f, 
        @location(1) normal: vec3f,
        @location(2) viewVec: vec3f,
        @location(3) originalXZ: vec2f,
        @location(4) waveHeight: f32
      }

      // Terrain height calculation (same as terrain shader)
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

      fn getTerrainHeight(worldX: f32, worldZ: f32) -> f32 {
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

      // Hash function for star generation
      fn hash31(p: vec3f) -> f32 {
        var p3 = fract(p * 0.1031);
        p3 += dot(p3, p3.zyx + 31.32);
        return fract((p3.x + p3.y) * p3.z);
      }

      // Hash function for cloud reflections (2D input -> 1D output)
      fn hash21(p: vec2f) -> f32 {
        var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      // Calculate night factor based on time of day
      // Day cycle: 120 seconds (configurable)
      fn getNightFactor(time: f32) -> f32 {
        let cycleDuration = 120.0;
        let timeOfDay = fract(time / cycleDuration);
        
        // Time periods (normalized 0-1):
        // 0.0-0.25: night to dawn
        // 0.25: sunrise
        // 0.25-0.75: day
        // 0.75: sunset
        // 0.75-1.0: dusk to night
        
        var nightFactor = 0.0;
        if (timeOfDay < 0.2) {
          // Night
          nightFactor = 1.0;
        } else if (timeOfDay < 0.3) {
          // Dawn transition
          let t = (timeOfDay - 0.2) / 0.1;
          nightFactor = 1.0 - t;
        } else if (timeOfDay < 0.7) {
          // Day
          nightFactor = 0.0;
        } else if (timeOfDay < 0.8) {
          // Dusk transition
          let t = (timeOfDay - 0.7) / 0.1;
          nightFactor = t;
        } else {
          // Night
          nightFactor = 1.0;
        }
        return nightFactor;
      }

      // Gerstner Wave function - physically based
      fn gerstnerWave(
        pos: vec2f,
        time: f32,
        direction: vec2f,
        steepness: f32,
        wavelength: f32,
        tangent: ptr<function, vec3f>,
        binormal: ptr<function, vec3f>
      ) -> vec3f {
        let k = 6.28318 / wavelength;
        let c = sqrt(9.8 / k);
        let d = normalize(direction);
        let f = k * (dot(d, pos) - c * time);
        let a = steepness / k;
        
        let sinF = sin(f);
        let cosF = cos(f);
        
        (*tangent) += vec3f(
          -d.x * d.x * steepness * sinF,
          d.x * steepness * cosF,
          -d.x * d.y * steepness * sinF
        );
        
        (*binormal) += vec3f(
          -d.x * d.y * steepness * sinF,
          d.y * steepness * cosF,
          -d.y * d.y * steepness * sinF
        );
        
        return vec3f(
          d.x * a * cosF,
          a * sinF,
          d.y * a * cosF
        );
      }

      @vertex fn vs(in: VSIn) -> VSOut {
        var out: VSOut;
        
        // Grid snapping to prevent visual undulation
        let gridSize = 31.25;
        let snappedX = floor(camera.position.x / gridSize) * gridSize;
        let snappedZ = floor(camera.position.z / gridSize) * gridSize;
        
        var worldPos = in.pos;
        worldPos.x += snappedX;
        worldPos.z += snappedZ;
        
        // Store original XZ for depth calculation in fragment
        out.originalXZ = worldPos.xz;
        
        // Initialize tangent and binormal
        var tangent = vec3f(1.0, 0.0, 0.0);
        var binormal = vec3f(0.0, 0.0, 1.0);
        
        // Calm water with very subtle movement - gentle ocean breathing
        let waveTime = o.time * 0.15;  // Very slow animation
        let wavePos = worldPos.xz;
        
        // Multiple very gentle sine waves at different scales and directions
        // Creates organic, non-repetitive subtle motion
        var waveHeight = 0.0;
        
        // Large gentle swells (barely perceptible)
        waveHeight += sin(wavePos.x * 0.008 + wavePos.y * 0.005 + waveTime) * 0.08;
        waveHeight += sin(wavePos.x * 0.006 - wavePos.y * 0.009 + waveTime * 1.1) * 0.06;
        
        // Medium ripples
        waveHeight += sin(wavePos.x * 0.025 + wavePos.y * 0.018 + waveTime * 1.3) * 0.03;
        waveHeight += sin(wavePos.x * 0.018 - wavePos.y * 0.022 - waveTime * 0.9) * 0.025;
        
        // Fine detail ripples (very subtle)
        waveHeight += sin(wavePos.x * 0.05 + wavePos.y * 0.04 + waveTime * 1.5) * 0.015;
        waveHeight += sin(wavePos.x * 0.04 - wavePos.y * 0.06 + waveTime * 1.2) * 0.012;
        
        // Apply wave height
        worldPos.y = o.waterLevel + waveHeight;
        
        // Calculate normal from wave gradient for subtle light variation
        let dx = cos(wavePos.x * 0.008 + wavePos.y * 0.005 + waveTime) * 0.008 * 0.08
               + cos(wavePos.x * 0.025 + wavePos.y * 0.018 + waveTime * 1.3) * 0.025 * 0.03
               + cos(wavePos.x * 0.05 + wavePos.y * 0.04 + waveTime * 1.5) * 0.05 * 0.015;
        let dz = cos(wavePos.x * 0.008 + wavePos.y * 0.005 + waveTime) * 0.005 * 0.08
               + cos(wavePos.x * 0.025 + wavePos.y * 0.018 + waveTime * 1.3) * 0.018 * 0.03
               + cos(wavePos.x * 0.05 + wavePos.y * 0.04 + waveTime * 1.5) * 0.04 * 0.015;
        
        // Subtle normal perturbation
        tangent = vec3f(1.0, dx * 2.0, 0.0);
        binormal = vec3f(0.0, dz * 2.0, 1.0);
        
        out.normal = normalize(cross(binormal, tangent));
        out.pos = camera.viewProjection * vec4f(worldPos, 1.0);
        out.worldPos = worldPos;
        out.viewVec = camera.position - worldPos;
        out.waveHeight = waveHeight;
        
        return out;
      }

      // Foam noise for natural foam pattern - organic, non-grid based
      // Uses rotated coordinates to break up grid patterns (from advanced sea example)
      fn foamNoise(p: vec2f, time: f32) -> f32 {
        // Rotation angles to break up grid patterns
        let angle1 = 0.4;
        let angle2 = 1.2;
        let angle3 = 2.1;
        let angle4 = 2.8;
        
        // Rotation matrices
        let c1 = cos(angle1); let s1 = sin(angle1);
        let c2 = cos(angle2); let s2 = sin(angle2);
        let c3 = cos(angle3); let s3 = sin(angle3);
        let c4 = cos(angle4); let s4 = sin(angle4);
        
        // Rotate coordinates for each layer to avoid grid alignment
        let rot1 = vec2f(p.x * c1 - p.y * s1, p.x * s1 + p.y * c1);
        let rot2 = vec2f(p.x * c2 - p.y * s2, p.x * s2 + p.y * c2);
        let rot3 = vec2f(p.x * c3 - p.y * s3, p.x * s3 + p.y * c3);
        let rot4 = vec2f(p.x * c4 - p.y * s4, p.x * s4 + p.y * c4);
        
        // Multiple layers with different rotations, speeds and scales
        let p1 = rot1 * 2.5 + vec2f(time * 0.3, time * 0.2);
        let p2 = rot2 * 4.5 - vec2f(time * 0.25, time * 0.35);
        let p3 = rot3 * 8.0 + vec2f(time * 0.15, -time * 0.18);
        let p4 = rot4 * 1.5 + vec2f(-time * 0.1, time * 0.12);
        
        // Smooth noise samples with rotated coordinates
        let n1 = smoothNoise(p1.x, p1.y);
        let n2 = smoothNoise(p2.x, p2.y) * 0.5;
        let n3 = smoothNoise(p3.x, p3.y) * 0.25;
        let n4 = smoothNoise(p4.x, p4.y) * 0.6;
        
        // Combine with smooth blending
        let combined = (n1 + n2 + n3 + n4) / 2.35;
        
        // Apply smooth curve to soften edges
        return smoothstep(0.2, 0.8, combined);
      }
      
      // Wave Crests function - generates foam on wave peaks (from advanced sea example)
      // Creates realistic foam patterns that appear on wave crests
      fn waveCrests(pos: vec3f, time: f32) -> f32 {
        var p = pos * 0.2;
        
        let octaves1 = 6;
        let octaves2 = 12;
        var f = 0.0;
        
        // Offset for animation
        let animOffset = vec3f(0.0, time * 0.1, time * 0.1);
        var samplePos = p + animOffset;
        var samplePos2 = p;
        
        // First set of octaves - large scale wave structure
        for (var i = 0; i < octaves1; i++) {
          // Rotate coordinates (yzx + zyx trick from example)
          let newPos = (samplePos.yzx + samplePos.zyx * vec3f(1.0, -1.0, 1.0)) / 1.414;
          samplePos = newPos;
          let noiseVal = smoothNoise(samplePos.x * 3.0, samplePos.z * 3.0);
          f = f * 1.5 + abs(noiseVal - 0.5) * 2.0;
          samplePos = samplePos * 2.0;
        }
        
        // Second set of octaves - fine detail
        samplePos2 = p * pow(2.0, f32(octaves1));
        samplePos2.y = -0.05 * time;
        for (var i = octaves1; i < octaves2; i++) {
          let newPos = (samplePos2.yzx + samplePos2.zyx * vec3f(1.0, -1.0, 1.0)) / 1.414;
          samplePos2 = newPos;
          let noiseVal = smoothNoise(samplePos2.x * 3.0, samplePos2.z * 3.0);
          f = f * 1.5 + pow(abs(noiseVal - 0.5) * 2.0, 1.0);
          samplePos2 = samplePos2 * 2.0;
        }
        
        f = f / 1500.0;
        
        // Add some screen-space noise to break up patterns
        let screenNoise = smoothNoise(pos.x * 12.0, pos.z * 12.0) * 0.01;
        f = f - screenNoise;
        
        // Sharp threshold for foam crests
        return pow(smoothstep(0.4, -0.1, f), 6.0);
      }

      @fragment fn fs(in: VSOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
        var normal = normalize(in.normal);
        let viewDir = normalize(in.viewVec);
        let sunDir = normalize(o.sunDir);
        let time = o.time;
        
        // ============================================
        // WATER BUMP MAPPING - Sample normal from texture
        // ============================================
        let bumpScale1 = 0.02;   // Large wave scale
        let bumpScale2 = 0.05;   // Medium detail
        let bumpScale3 = 0.12;   // Fine detail
        let bumpSpeed1 = 0.03;   // Slow movement
        let bumpSpeed2 = 0.05;   // Medium speed
        let bumpSpeed3 = 0.08;   // Faster fine detail
        let bumpStrength = 0.4;  // Overall bump intensity
        
        // Sample bump map at multiple scales and speeds for realistic water
        let uv1 = in.worldPos.xz * bumpScale1 + vec2f(time * bumpSpeed1, time * bumpSpeed1 * 0.7);
        let uv2 = in.worldPos.xz * bumpScale2 + vec2f(-time * bumpSpeed2 * 0.8, time * bumpSpeed2);
        let uv3 = in.worldPos.xz * bumpScale3 + vec2f(time * bumpSpeed3, -time * bumpSpeed3 * 0.6);
        
        // Sample and convert from 0-1 to -1 to 1
        let bump1 = textureSample(waterBumpTex, waterSampler, uv1).rgb * 2.0 - 1.0;
        let bump2 = textureSample(waterBumpTex, waterSampler, uv2).rgb * 2.0 - 1.0;
        let bump3 = textureSample(waterBumpTex, waterSampler, uv3).rgb * 2.0 - 1.0;
        
        // Blend bump maps with different weights
        var bumpNormal = bump1 * 0.5 + bump2 * 0.35 + bump3 * 0.15;
        bumpNormal = normalize(bumpNormal);
        
        // Perturb the geometric normal with the bump
        // The bump map is in tangent space, so we need to rotate it to world space
        // For a mostly-flat water surface, we can approximate this
        let tangent = normalize(vec3f(1.0, 0.0, 0.0));
        let binormal = normalize(cross(normal, tangent));
        let perturbedNormal = normalize(
          normal + 
          (tangent * bumpNormal.x + binormal * bumpNormal.y) * bumpStrength
        );
        
        // Use perturbed normal for lighting calculations
        normal = perturbedNormal;
        
        // Check if we're viewing from below (camera underwater looking up)
        let viewingFromBelow = !frontFacing;
        
        // Flip normal if viewing from below
        if (viewingFromBelow) {
          normal = -normal;
        }
        
        // Use original coordinates for terrain height (no distortion for clean look)
        let terrainH = getTerrainHeight(in.originalXZ.x, in.originalXZ.y);
        
        // Calculate water depth (positive = underwater terrain)
        let depth = o.waterLevel - terrainH;
        
        // Discard pixels where terrain is above water (islands/mountains) - only when viewing from above
        if (depth < 0.0 && !viewingFromBelow) {
          discard;
        }
        
        // ================================================
        // UNDERWATER VIEW (viewing water surface from below)
        // ================================================
        if (viewingFromBelow) {
          // Distance from camera to this point on the surface
          let distToSurface = length(in.viewVec);
          let cameraDepth = o.waterLevel - camera.position.y;
          
          // Base underwater surface color
          var surfaceColor = vec3f(0.1, 0.2, 0.35);
          
          // Depth fade for effects
          let rayDepthFade = smoothstep(40.0, 0.0, cameraDepth);
          
          // ============================================
          // BUMP-BASED SURFACE DISTORTION
          // Use the bump normal to create realistic wave distortion
          // ============================================
          // The bump normal (calculated earlier) affects how we see through the surface
          let bumpDistortion = (perturbedNormal.xz - vec2f(0.0, 0.0)) * 0.3;
          let distortedWorldXZ = in.worldPos.xz + bumpDistortion * 20.0;
          
          // ============================================
          // CAUSTICS - Now use bump-distorted coordinates
          // ============================================
          let worldXZ = distortedWorldXZ;  // Use distorted coords for caustics
          let t = time * 0.4;
          
          // Use irrational/prime ratios to avoid repeating patterns
          // Multiple overlapping waves at non-harmonic frequencies
          let p = worldXZ * 0.04;
          
          // Wave set 1 - large scale
          var caustics = 0.0;
          caustics += sin(p.x * 1.0 + p.y * 0.7 + t) * 0.5;
          caustics += sin(p.x * 0.7 - p.y * 1.0 + t * 1.1) * 0.5;
          caustics += sin(p.x * 1.3 + p.y * 0.4 - t * 0.9) * 0.4;
          
          // Wave set 2 - medium scale with different phase
          let p2 = worldXZ * 0.08;
          caustics += sin(p2.x * 1.1 + p2.y * 1.7 + t * 1.3) * 0.3;
          caustics += sin(p2.x * 1.7 - p2.y * 1.1 - t * 0.8) * 0.3;
          caustics += sin(p2.x * 0.9 + p2.y * 1.3 + t * 1.5) * 0.25;
          
          // Wave set 3 - fine detail
          let p3 = worldXZ * 0.15;
          caustics += sin(p3.x * 2.1 + p3.y * 1.3 - t * 1.7) * 0.15;
          caustics += sin(p3.x * 1.3 - p3.y * 2.1 + t * 1.2) * 0.15;
          
          // Normalize and create bright spots
          caustics = caustics / 2.5;
          caustics = max(0.0, caustics); // Only positive values (bright spots)
          caustics = pow(caustics, 1.5); // Sharpen the bright areas
          caustics *= rayDepthFade;
          
          // Add caustics as subtle bright spots
          surfaceColor += vec3f(0.25, 0.4, 0.5) * caustics;
          
          // ============================================
          // BUBBLES - World-space bubbles rising through the water
          // ============================================
          var bubbleLight = 0.0;
          
          // Generate bubbles based on world position
          for (var i = 0u; i < 20u; i++) {
            // Create pseudo-random but fixed world positions for bubbles
            let seed = f32(i) * 127.1;
            let bubbleBaseX = fract(sin(seed) * 43758.5453) * 200.0 - 100.0 + camera.position.x;
            let bubbleBaseZ = fract(sin(seed * 1.3) * 22578.1459) * 200.0 - 100.0 + camera.position.z;
            
            // Bubbles rise over time, wrapping around
            let riseSpeed = 2.0 + fract(sin(seed * 2.1) * 12345.6) * 3.0;
            let bubbleY = o.waterLevel - 30.0 + fract(time * riseSpeed * 0.05 + fract(sin(seed * 3.7) * 9876.5)) * 35.0;
            
            // Bubble size varies
            let bubbleSize = 0.3 + fract(sin(seed * 4.2) * 5678.9) * 0.7;
            
            // Wobble as they rise
            let wobbleX = sin(time * 2.0 + seed) * 0.5;
            let wobbleZ = cos(time * 1.7 + seed * 1.5) * 0.5;
            
            let bubblePos = vec3f(bubbleBaseX + wobbleX, bubbleY, bubbleBaseZ + wobbleZ);
            
            // Distance from this surface point to the bubble
            let toBubble = in.worldPos - bubblePos;
            let distToBubble = length(toBubble);
            
            // Only show bubbles that are near our view ray
            if (distToBubble < bubbleSize * 3.0) {
              let bubbleIntensity = smoothstep(bubbleSize * 2.0, bubbleSize * 0.3, distToBubble);
              // Highlight on bubble
              let highlight = smoothstep(bubbleSize * 0.8, 0.0, distToBubble) * 0.5;
              bubbleLight += bubbleIntensity * 0.15 + highlight;
            }
          }
          
          // Add bubble color (white/bright cyan)
          surfaceColor += vec3f(0.9, 0.95, 1.0) * bubbleLight;
          
          // ============================================
          // SNELL'S WINDOW - See the sky through water surface
          // Critical angle effect + diffuse view of exterior
          // ============================================
          let NdotV = max(dot(normal, viewDir), 0.0);
          let underwaterFresnel = pow(1.0 - NdotV, 3.0);
          
          // Calculate what we'd see looking up through water
          // Refracted view direction (water to air, index 1.33 -> 1.0)
          let refractDir = refract(-viewDir, normal, 1.0 / 1.33);
          
          // Time of day for sky colors
          let cycleDuration = 120.0;
          let timeOfDay = fract(time / cycleDuration);
          var skyNightFactor = 0.0;
          if (timeOfDay < 0.2) { skyNightFactor = 1.0; }
          else if (timeOfDay < 0.3) { skyNightFactor = 1.0 - (timeOfDay - 0.2) / 0.1; }
          else if (timeOfDay < 0.7) { skyNightFactor = 0.0; }
          else if (timeOfDay < 0.8) { skyNightFactor = (timeOfDay - 0.7) / 0.1; }
          else { skyNightFactor = 1.0; }
          let skyDayFactor = 1.0 - skyNightFactor;
          
          // Sun/Moon direction (simplified)
          let sunAngle = timeOfDay * 6.28318 - 1.5708;
          let sunDirSky = normalize(vec3f(cos(sunAngle) * 0.8, sin(sunAngle), 0.3));
          let moonDirSky = normalize(vec3f(-sunDirSky.x, max(-sunDirSky.y, 0.1), -sunDirSky.z * 0.5));
          
          // Sky gradient seen through water (diffused)
          var skySeenColor = vec3f(0.0);
          
          // Only see sky when looking somewhat upward and within Snell's window
          let lookingUp = refractDir.y;
          let snellWindow = smoothstep(0.0, 0.5, lookingUp) * (1.0 - underwaterFresnel * 0.7);
          
          if (snellWindow > 0.01) {
            // Day sky - blue gradient
            let daySkyZenith = vec3f(0.15, 0.4, 0.9);
            let daySkyHorizon = vec3f(0.5, 0.7, 0.95);
            let horizonFactor = 1.0 - smoothstep(0.0, 0.8, lookingUp);
            let daySky = mix(daySkyZenith, daySkyHorizon, horizonFactor);
            
            // Night sky - deep blue with cyan horizon glow
            let nightSkyZenith = vec3f(0.02, 0.04, 0.10);
            let nightSkyHorizon = vec3f(0.06, 0.14, 0.22);
            let nightSky = mix(nightSkyZenith, nightSkyHorizon, horizonFactor);
            
            // Blend day/night sky
            skySeenColor = mix(nightSky, daySky, skyDayFactor);
            
            // ======= SUN (during day) =======
            if (skyDayFactor > 0.1 && sunDirSky.y > -0.1) {
              let sunDot = max(0.0, dot(refractDir, sunDirSky));
              // Sun disc (diffused through water)
              let sunDisc = smoothstep(0.97, 0.995, sunDot);
              // Sun glow (larger, softer)
              let sunGlow = pow(sunDot, 32.0) * 0.8;
              let sunColor = vec3f(1.0, 0.95, 0.8);
              skySeenColor += sunColor * (sunDisc * 2.0 + sunGlow) * skyDayFactor;
            }
            
            // ======= MOON (during night) =======
            if (skyNightFactor > 0.1 && moonDirSky.y > 0.0) {
              let moonDot = max(0.0, dot(refractDir, moonDirSky));
              // Moon disc (diffused)
              let moonDisc = smoothstep(0.98, 0.995, moonDot);
              // Moon glow
              let moonGlow = pow(moonDot, 64.0) * 0.5;
              let moonColor = vec3f(0.9, 0.92, 1.0);
              skySeenColor += moonColor * (moonDisc * 1.5 + moonGlow) * skyNightFactor;
            }
            
            // ======= STARS (during night) =======
            if (skyNightFactor > 0.3) {
              // Star field based on view direction
              let starScale = 300.0;
              let starCoord = floor(refractDir * starScale);
              let starHash = fract(sin(dot(starCoord, vec3f(12.9898, 78.233, 45.164))) * 43758.5453);
              
              if (starHash > 0.992) {
                let cellFract = fract(refractDir * starScale);
                let distToCenter = length(cellFract - 0.5);
                let starGlow = exp(-distToCenter * distToCenter * 6.0);
                let brightness = (starHash - 0.992) / 0.008;
                let twinkle = 0.7 + sin(time * 3.0 + starHash * 100.0) * 0.3;
                skySeenColor += vec3f(1.0, 1.0, 1.0) * starGlow * brightness * twinkle * skyNightFactor * 0.6;
              }
            }
            
            // ======= CLOUDS (diffused) =======
            let cloudTime = time * 0.015;
            let cloudUV = refractDir.xz / max(refractDir.y, 0.1) * 0.3;
            let cloudP = cloudUV + vec2f(cloudTime, cloudTime * 0.3);
            
            // Simple cloud noise
            var cloudVal = 0.0;
            cloudVal += sin(cloudP.x * 2.0 + cloudP.y * 1.5) * 0.5 + 0.5;
            cloudVal *= sin(cloudP.x * 1.3 - cloudP.y * 2.1 + 0.5) * 0.5 + 0.5;
            cloudVal = smoothstep(0.3, 0.7, cloudVal);
            
            // Cloud color
            let dayCloudColor = vec3f(0.9, 0.92, 0.95);
            let nightCloudColor = vec3f(0.1, 0.12, 0.18);
            let cloudColor = mix(nightCloudColor, dayCloudColor, skyDayFactor);
            
            // Blend clouds into sky
            skySeenColor = mix(skySeenColor, cloudColor, cloudVal * 0.5 * camera.cloudCoverage);
          }
          
          // Apply Snell's window effect - blend sky into underwater view
          // More visible when looking straight up, diffused by water
          // Use bump normal to distort the view through the surface
          let bumpViewDistort = perturbedNormal.xz * 0.15;
          let waterTint = vec3f(0.6, 0.85, 1.0); // Cyan tint from water
          let tintedSky = skySeenColor * waterTint;
          
          // Bump affects how much sky we see (wavy Snell's window)
          let bumpedSnell = snellWindow * (0.9 + dot(perturbedNormal, vec3f(0.0, 1.0, 0.0)) * 0.2);
          surfaceColor = mix(surfaceColor, tintedSky, bumpedSnell * 0.6);
          
          // ============================================
          // WAVE SHIMMER - Enhanced with bump texture
          // ============================================
          let shimmerP = worldXZ * 0.06;
          // Add bump-based shimmer variation
          let bumpShimmer = (perturbedNormal.x + perturbedNormal.z) * 0.5;
          let shimmer = sin(shimmerP.x * 2.3 + shimmerP.y * 1.7 + time * 0.6 + bumpShimmer * 3.0) * 
                        sin(shimmerP.x * 1.7 - shimmerP.y * 2.3 - time * 0.5 + bumpShimmer * 2.0) * 0.15;
          surfaceColor += vec3f(0.15, 0.25, 0.35) * max(shimmer, 0.0);
          
          // Bump-based light reflection from above (sun/moon light through waves)
          let surfaceLightNormal = dot(perturbedNormal, sunDir);
          let waveLightVariation = max(0.0, surfaceLightNormal) * 0.1;
          surfaceColor += vec3f(0.2, 0.3, 0.4) * waveLightVariation * rayDepthFade;
          
          // ============================================
          // UNDERWATER FOG - Visibility decreases with distance
          // ============================================
          let fogFactor = 1.0 - exp(-distToSurface * 0.02);
          let fogColor = vec3f(0.02, 0.06, 0.12);
          surfaceColor = mix(surfaceColor, fogColor, fogFactor * 0.5);
          
          // Depth-based darkening
          let depthDarken = smoothstep(0.0, 25.0, cameraDepth) * 0.4;
          surfaceColor *= 1.0 - depthDarken;
          
          // Alpha - mostly opaque
          let alpha = 0.9;
          
          return vec4f(surfaceColor, alpha);
        }
        
        // ================================================
        // NORMAL VIEW (viewing water surface from above)
        // ================================================
        
        // Calculate night factor for day/night effects
        let nightFactor = getNightFactor(time);
        let dayFactor = 1.0 - nightFactor;
        
        // Fresnel effect - parametrized
        let NdotV = max(dot(normal, viewDir), 0.0);
        let fresnel = o.fresnelF0 + (1.0 - o.fresnelF0) * pow(1.0 - NdotV, o.fresnelPower);
        
        // Enhanced depth-based color with stronger shallow tint
        let depthFactor = smoothstep(0.0, o.deepDepth, depth);
        let shallowFactor = smoothstep(o.shallowDepth, 0.0, depth);
        var waterColor = mix(o.shallowColor, o.deepColor, depthFactor);
        
        // Night water - subtle moonlit ocean, not too bright
        // Base night color: dark blue-teal
        let nightWaterBase = vec3f(0.08, 0.12, 0.18);  // Subtle dark blue
        // Darken by 30% at night
        waterColor = mix(waterColor, nightWaterBase, nightFactor * 0.30);
        
        // Moderate moonlight ambient lighting on water
        let moonlightAmbient = vec3f(0.06, 0.08, 0.12) * nightFactor;  // Subtle cool moonlight
        waterColor += moonlightAmbient;
        
        // Subtle sky reflection at night
        let skyReflection = vec3f(0.02, 0.04, 0.06) * nightFactor;
        waterColor += skyReflection;
        
        // Add underwater tint that's strongest in shallow water (where avatar legs would be)
        // Keep some tint at night for color variation
        let tintDayMix = max(dayFactor, 0.3);  // At least 30% tint at night
        waterColor = mix(waterColor, o.underwaterTint, shallowFactor * o.underwaterTintStr * tintDayMix);
        
        // Subsurface scattering - reduced at night but not eliminated
        let sssStrengthCalc = pow(max(0.0, dot(viewDir, -sunDir + normal * 0.3)), o.sssPower);
        let sssDayNight = max(dayFactor, nightFactor * 0.2);  // Keep 20% SSS at night (moonlight)
        let sss = o.sssColor * sssStrengthCalc * (o.sssStrength + shallowFactor * o.sssShallowBoost) * sssDayNight;
        // Tint SSS blue at night for moonlight effect
        let sssFinal = mix(sss, sss * vec3f(0.6, 0.8, 1.0), nightFactor);
        waterColor += sssFinal;
        
        // Caustics effect - light patterns on shallow water (only during day)
        let causticsUV1 = (in.originalXZ + vec2f(time * o.causticsSpeed, time * o.causticsSpeed * 0.75)) * o.causticsScale;
        let caustics1 = smoothNoise(causticsUV1.x, causticsUV1.y);
        let causticsUV2 = (in.originalXZ - vec2f(time * o.causticsSpeed * 0.625, time * o.causticsSpeed * 1.125)) * o.causticsScale * 1.3;
        let caustics2 = smoothNoise(causticsUV2.x, causticsUV2.y);
        let caustics = (caustics1 * caustics2) * 2.0;
        let causticsResult = shallowFactor * o.causticsIntensity * caustics * dayFactor;
        waterColor += o.causticsColor * causticsResult;
        
        // ============================================
        // STAR REFLECTIONS - Stars reflected on water at night
        // ============================================
        if (nightFactor > 0.1) {
          // Calculate reflection direction - flip view across water normal
          let reflectDir = reflect(-viewDir, normal);
          
          // Only reflect things above horizon (looking up)
          if (reflectDir.y > 0.0) {
            // Normalize the reflection for consistent star placement
            let normReflect = normalize(reflectDir);
            
            // Calm water - no wave distortion for perfect mirror reflection
            let distortedReflect = normReflect;
            
            // ========== SMALL STARS ==========
            let starScale = 500.0;
            let starCoord = floor(distortedReflect * starScale);
            let starHash = hash31(starCoord);
            
            // More stars visible (lower threshold)
            if (starHash > 0.992) {
              // Simple point-like stars with soft glow
              let cellFract = fract(distortedReflect * starScale);
              let distToCenter = length(cellFract - 0.5);
              
              // Soft star glow
              let starGlow = exp(-distToCenter * distToCenter * 8.0);
              
              // Brightness based on hash
              let brightness = (starHash - 0.992) / 0.008;
              
              // Calm water - no shimmer, steady reflection
              let shimmer = 1.0;
              
              // Final intensity
              let intensity = brightness * starGlow * shimmer * nightFactor * 0.8;
              
              // Star color variation
              var starColor = vec3f(1.0, 1.0, 1.0);
              if (starHash > 0.998) {
                starColor = vec3f(0.7, 0.8, 1.0);  // Blue star
              } else if (starHash > 0.996) {
                starColor = vec3f(1.0, 0.95, 0.8); // Yellow star
              }
              
              waterColor += starColor * intensity;
            }
            
            // ========== BRIGHT STARS ==========
            let bigStarScale = 180.0;
            let bigStarCoord = floor(distortedReflect * bigStarScale);
            let bigStarHash = hash31(bigStarCoord);
            
            if (bigStarHash > 0.995) {
              let cellFract = fract(distortedReflect * bigStarScale);
              let distToCenter = length(cellFract - 0.5);
              
              // Larger, softer glow for bright stars
              let starGlow = exp(-distToCenter * distToCenter * 4.0);
              
              let brightness = (bigStarHash - 0.995) / 0.005;
              let shimmer = 0.7 + sin(time * 2.0 + bigStarHash * 50.0) * 0.3;
              
              let intensity = brightness * starGlow * shimmer * nightFactor * 1.2;
              
              waterColor += vec3f(0.9, 0.95, 1.0) * intensity;
            }
            
            // ========== VERY BRIGHT STARS (few) ==========
            let veryBrightScale = 80.0;
            let veryBrightCoord = floor(distortedReflect * veryBrightScale);
            let veryBrightHash = hash31(veryBrightCoord);
            
            if (veryBrightHash > 0.997) {
              let cellFract = fract(distortedReflect * veryBrightScale);
              let distToCenter = length(cellFract - 0.5);
              
              // Wide glow for very bright stars
              let starGlow = exp(-distToCenter * distToCenter * 2.5);
              
              let brightness = (veryBrightHash - 0.997) / 0.003;
              let shimmer = 0.8 + sin(time * 1.5 + veryBrightHash * 30.0) * 0.2;
              
              let intensity = brightness * starGlow * shimmer * nightFactor * 1.5;
              
              waterColor += vec3f(1.0, 1.0, 1.0) * intensity;
            }
          }
          
          // ========== MOON REFLECTION ==========
          let moonDir = normalize(vec3f(-sunDir.x, max(-sunDir.y, 0.15), -sunDir.z * 0.5));
          let moonReflectDir = reflect(-viewDir, normal);
          let moonDot = dot(normalize(moonReflectDir), moonDir);
          
          if (moonDot > 0.95 && moonDir.y > 0.0) {
            // Moon reflection - much smaller and more focused
            let moonIntensity = smoothstep(0.95, 0.995, moonDot) * nightFactor * 0.4;  // Much dimmer
            
            // Calm water - steady moon reflection
            let moonShimmer = 1.0;
            
            let moonColor = vec3f(0.7, 0.75, 0.85) * moonIntensity * moonShimmer;  // Dimmer color
            waterColor += moonColor;
          }
        }
        
        // ============================================
        // CLOUD REFLECTIONS - Procedural clouds reflected on water
        // Calm water - clean reflection without distortion
        // ============================================
        {
          let reflectDir = reflect(-viewDir, normal);
          if (reflectDir.y > 0.01) {
            let cloudTime = time * 0.015;  // Match sky cloud speed
            let coverage = camera.cloudCoverage;
            
            // Project reflection onto cloud plane height - extended range
            let t1 = 0.12 / max(reflectDir.y, 0.01);
            let cloudUV = vec2f(
              reflectDir.x * t1 * 1.2 + cloudTime * 0.8,
              reflectDir.z * t1 * 1.2 + cloudTime * 0.2
            );
            
            // Generate cloud pattern
            var cloudRefl = 0.0;
            var amp = 0.5;
            var p = cloudUV;
            
            // Octave 1
            var ii = floor(p * 3.0);
            var ff = fract(p * 3.0);
            var uu = ff * ff * ff * (ff * (ff * 6.0 - 15.0) + 10.0);
            var aa = hash21(ii);
            var bb = hash21(ii + vec2f(1.0, 0.0));
            var cc = hash21(ii + vec2f(0.0, 1.0));
            var ddd = hash21(ii + vec2f(1.0, 1.0));
            cloudRefl += mix(mix(aa, bb, uu.x), mix(cc, ddd, uu.x), uu.y) * amp;
            amp *= 0.5; p = p * 2.0 + vec2f(0.3, 0.7);
            
            // Octave 2
            ii = floor(p * 3.0); ff = fract(p * 3.0);
            uu = ff * ff * ff * (ff * (ff * 6.0 - 15.0) + 10.0);
            aa = hash21(ii); bb = hash21(ii + vec2f(1.0, 0.0));
            cc = hash21(ii + vec2f(0.0, 1.0)); ddd = hash21(ii + vec2f(1.0, 1.0));
            cloudRefl += mix(mix(aa, bb, uu.x), mix(cc, ddd, uu.x), uu.y) * amp;
            amp *= 0.5; p = p * 2.0 + vec2f(-0.2, 0.4);
            
            // Octave 3
            ii = floor(p * 3.0); ff = fract(p * 3.0);
            uu = ff * ff * ff * (ff * (ff * 6.0 - 15.0) + 10.0);
            aa = hash21(ii); bb = hash21(ii + vec2f(1.0, 0.0));
            cc = hash21(ii + vec2f(0.0, 1.0)); ddd = hash21(ii + vec2f(1.0, 1.0));
            cloudRefl += mix(mix(aa, bb, uu.x), mix(cc, ddd, uu.x), uu.y) * amp;
            amp *= 0.5; p = p * 2.0 + vec2f(0.5, -0.3);
            
            // Octave 4
            ii = floor(p * 3.0); ff = fract(p * 3.0);
            uu = ff * ff * ff * (ff * (ff * 6.0 - 15.0) + 10.0);
            aa = hash21(ii); bb = hash21(ii + vec2f(1.0, 0.0));
            cc = hash21(ii + vec2f(0.0, 1.0)); ddd = hash21(ii + vec2f(1.0, 1.0));
            cloudRefl += mix(mix(aa, bb, uu.x), mix(cc, ddd, uu.x), uu.y) * amp;
            amp *= 0.5; p = p * 2.0 + vec2f(-0.4, 0.6);
            
            // Octave 5
            ii = floor(p * 3.0); ff = fract(p * 3.0);
            uu = ff * ff * ff * (ff * (ff * 6.0 - 15.0) + 10.0);
            aa = hash21(ii); bb = hash21(ii + vec2f(1.0, 0.0));
            cc = hash21(ii + vec2f(0.0, 1.0)); ddd = hash21(ii + vec2f(1.0, 1.0));
            cloudRefl += mix(mix(aa, bb, uu.x), mix(cc, ddd, uu.x), uu.y) * amp;
            
            // Threshold based on coverage (matches sky threshold)
            let threshold = 0.25 + (1.0 - coverage) * 0.45;
            var cloudShape = smoothstep(threshold, threshold + 0.2, cloudRefl);
            
            // Height fade - clouds visible across more of the reflection
            let heightFade = smoothstep(0.01, 0.1, reflectDir.y) * smoothstep(0.95, 0.5, reflectDir.y);
            cloudShape = cloudShape * heightFade;
            
            // Cloud reflection colors
            let cloudWhite = vec3f(0.95, 0.97, 1.0);
            let cloudGray = vec3f(0.75, 0.78, 0.82);
            let cloudNightLit = vec3f(0.2, 0.22, 0.28);
            let cloudNightDark = vec3f(0.06, 0.08, 0.12);
            
            // Sun/moon lighting on reflected clouds
            let sunLight = max(0.0, sunDir.y);
            let moonLight = max(0.0, -sunDir.y) * nightFactor;
            
            var dayCloudReflColor = mix(cloudGray, cloudWhite, 0.3 + sunLight * 0.7);
            let nightCloudReflColor = mix(cloudNightDark, cloudNightLit, moonLight * 0.5);
            let cloudReflColor = mix(nightCloudReflColor, dayCloudReflColor, dayFactor);
            
            // Reflection strength - subtle and transparent, not painted on
            // Reflections should blend with water, not cover it
            let dayReflectionStrength = fresnel * 0.35 + 0.08;  // Subtle during day
            let nightReflectionStrength = fresnel * 0.08 + 0.02;  // Very subtle at night
            let reflectionStrength = mix(nightReflectionStrength, dayReflectionStrength, dayFactor);
            
            // Soften cloud edges for more natural reflection
            let softCloud = cloudShape * cloudShape * (3.0 - 2.0 * cloudShape); // smoothstep curve
            
            // Apply cloud reflection to water - additive blend for transparency
            let reflectionAmount = softCloud * reflectionStrength * 0.6;
            waterColor = mix(waterColor, cloudReflColor, reflectionAmount);
            
            // Add subtle bright edge on reflected clouds (silver lining)
            if (dayFactor > 0.3) {
              let edge = smoothstep(0.15, 0.4, cloudShape) * (1.0 - smoothstep(0.4, 0.7, cloudShape));
              waterColor = waterColor + vec3f(0.08, 0.08, 0.06) * edge * sunLight * dayFactor;
            }
          }
        }
        
        // ============================================
        // AVATAR REFLECTION - Simple procedural reflection of character
        // ============================================
        {
          // Calculate reflection position - mirror avatar across water surface
          let avatarReflectPos = vec3f(o.avatarPos.x, o.waterLevel - (o.avatarPos.y - o.waterLevel), o.avatarPos.z);
          
          // Vector from water surface point to reflected avatar position
          let toAvatar = avatarReflectPos - in.worldPos;
          let distToAvatar = length(toAvatar.xz);
          
          // Avatar is visible in reflection when close and below water level won't work
          // Check if avatar is above water and we're looking at area near avatar
          let avatarAboveWater = o.avatarPos.y > o.waterLevel - 2.0;
          
          if (avatarAboveWater && distToAvatar < 15.0) {
            // Create elliptical shape for avatar silhouette
            let avatarWidth = 1.2;  // Width of avatar reflection
            let avatarH = o.avatarHeight * 2.0;  // Height stretched for reflection
            
            // Relative position in avatar's local reflection space
            let localX = (in.worldPos.x - o.avatarPos.x) / avatarWidth;
            let localZ = (in.worldPos.z - o.avatarPos.z) / avatarWidth;
            
            // Distance from avatar center in XZ plane
            let radialDist = sqrt(localX * localX + localZ * localZ);
            
            // Vertical position relative to avatar (stretched downward in reflection)
            // The reflection extends below the avatar's feet position
            let reflectY = o.waterLevel - in.worldPos.y;  // Not used directly, we use radialDist
            
            // Create avatar silhouette - elliptical falloff
            var avatarShape = 1.0 - smoothstep(0.0, 1.0, radialDist);
            avatarShape *= smoothstep(15.0, 3.0, distToAvatar);  // Fade with distance
            
            // Darken based on how far avatar is above water (less reflection when high)
            let heightAboveWater = max(0.0, o.avatarPos.y - o.waterLevel);
            let heightFade = 1.0 - smoothstep(0.0, 8.0, heightAboveWater);
            avatarShape *= heightFade;
            
            // Avatar reflection color - dark silhouette with slight color
            let avatarReflColor = vec3f(0.15, 0.12, 0.1);  // Dark brownish for avatar
            let avatarReflColorNight = vec3f(0.05, 0.04, 0.03);  // Darker at night
            let finalAvatarColor = mix(avatarReflColorNight, avatarReflColor, dayFactor);
            
            // Apply avatar reflection with fresnel
            let avatarReflStrength = avatarShape * fresnel * 0.4;
            waterColor = mix(waterColor, finalAvatarColor, avatarReflStrength);
          }
        }
        
        // ============================================
        // NIGHT SKY REFLECTION - Subtle blue reflection at night
        // ============================================
        let nightSkyReflection = vec3f(0.04, 0.06, 0.10);  // Subtle blue
        let daySkyReflection = o.skyReflection;
        let skyReflectionColor = mix(daySkyReflection, nightSkyReflection, nightFactor);
        waterColor = mix(waterColor, skyReflectionColor, fresnel * o.skyReflectionStr);
        
        // === SHORELINE FOAM - soft and natural ===
        let shoreFactor = 1.0 - smoothstep(0.0, o.foamDepthMax, depth);
        
        // Animate the foam UV coordinates to create flowing/advancing water edge effect
        // This makes the water boundary appear to flow and change shape organically
        let flowSpeed = 0.15;
        let flowOffset = vec2f(
          sin(time * flowSpeed * 0.7) * 8.0 + cos(time * flowSpeed * 0.5) * 5.0,
          cos(time * flowSpeed * 0.6) * 7.0 + sin(time * flowSpeed * 0.8) * 4.0
        );
        
        // Secondary slower flow for larger patterns
        let flowOffset2 = vec2f(
          sin(time * flowSpeed * 0.3 + 1.5) * 12.0,
          cos(time * flowSpeed * 0.25 + 2.0) * 10.0
        );
        
        // Multiple foam layers with flowing UV coordinates
        let foamUV1 = (in.originalXZ + flowOffset) * 0.08;
        let foamUV2 = (in.originalXZ + flowOffset2) * 0.04;
        let foamUV3 = (in.originalXZ - flowOffset * 0.5) * 0.15;
        
        // Get foam patterns at different scales - all flowing
        let foamPattern1 = foamNoise(foamUV1, time);
        let foamPattern2 = foamNoise(foamUV2, time * 0.7);
        let foamPattern3 = foamNoise(foamUV3, time * 1.3);
        
        // Blend foam patterns organically
        let foamPattern = foamPattern1 * 0.5 + foamPattern2 * 0.35 + foamPattern3 * 0.15;
        
        // Calm water - static shoreline foam, no wave motion
        let waveMotion = 1.0;
        
        // Static edge foam
        let edgeDepth = smoothstep(o.foamEdgeStart + 1.0, -0.5, depth);
        let edgeFoam = edgeDepth * smoothstep(0.3, 0.7, foamPattern * 0.6 + 0.15);
        
        // Band foam further from shore - more scattered, also flowing
        let bandFoam = shoreFactor * smoothstep(0.5, 0.75, foamPattern) * 0.6;
        
        // ============================================
        // WAVE CRESTS FOAM - disabled for calm water
        // ============================================
        let crestFoamFinal = 0.0;  // No wave crests on calm water
        
        // Combine all foam types with soft blending
        var totalFoam = clamp((edgeFoam * o.foamEdgeStrength * 0.7 + bandFoam * o.foamBandStrength * 0.5 + crestFoamFinal), 0.0, 0.85);
        
        // Reduce foam visibility at night (less visible, more natural)
        let foamNightFade = 0.2 + dayFactor * 0.8;  // 20% visible at night
        totalFoam *= foamNightFade;
        
        // Softer foam color - less pure white, more natural
        let softFoamColor = vec3f(0.85, 0.9, 0.92);  // Soft blue-white
        let nightFoamColor = vec3f(0.15, 0.18, 0.22);  // Dim gray-blue at night
        let dayFoamColor = mix(o.foamColor, softFoamColor, 0.5);  // Blend config with soft color
        let foamColorFinal = mix(nightFoamColor, dayFoamColor, dayFactor);
        
        // Soft blend foam into water - not harsh transition
        let foamBlend = totalFoam * 0.7;  // Reduce opacity
        waterColor = mix(waterColor, foamColorFinal, foamBlend);
        
        // Sun/Moon specular - use regular normal for clean reflections
        let halfDir = normalize(viewDir + sunDir);
        let NdotH = max(dot(normal, halfDir), 0.0);
        
        // Reduce specular at night
        let specIntensity = dayFactor * 0.9 + 0.1;  // 10% at night
        let spec = pow(NdotH, o.specPower) * o.specStrength * specIntensity;
        let sparkle = pow(NdotH, o.sparklePower) * o.sparkleStrength * specIntensity;
        
        waterColor += o.sunColor * (spec + sparkle) * (1.0 - totalFoam * 0.5);
        
        // Lighting - balanced for night visibility
        let nightAmbient = 0.32;  // Moderate ambient at night
        let nightDiffuse = 0.08;  // Minimal moonlight diffuse
        let ambientFinal = mix(nightAmbient, o.ambientLight, dayFactor);
        let diffuseFinal = mix(nightDiffuse, o.diffuseLight, dayFactor);
        let lightBoostFinal = o.lightBoost * max(dayFactor, nightFactor * 0.15);
        
        let diffuse = max(dot(normal, sunDir), 0.0) * diffuseFinal;
        waterColor *= (ambientFinal + diffuse + lightBoostFinal);
        
        // Foam light boost - reduced at night
        waterColor += foamColorFinal * totalFoam * o.foamLightBoost * foamNightFade;
        
        // Enhanced alpha for better underwater visibility effect
        let baseAlpha = mix(o.baseAlphaMin, o.baseAlphaMax, fresnel);
        let depthAlpha = smoothstep(0.0, o.depthAlphaRange, depth);
        let shallowAlpha = smoothstep(0.0, o.veryShallowDepth, depth) * o.shallowAlphaBoost;
        var alpha = mix(baseAlpha * 0.75, baseAlpha, depthAlpha) + shallowAlpha;
        alpha = clamp(alpha, 0.0, 1.0);
        alpha = mix(alpha, 1.0, totalFoam * o.foamAlphaBlend);
        
        return vec4f(waterColor, alpha);
      }
`
