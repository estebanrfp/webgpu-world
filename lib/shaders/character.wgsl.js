/**
 * Character Shader - WGSL shader for skinned character rendering
 * Features: skeletal animation, shadow mapping, underwater effects
 * Part of TypeGPU-Project-World modular shader system
 */

/**
 * Main character rendering shader with:
 * - Skeletal animation (bone skinning)
 * - Dynamic day/night cycle lighting
 * - Shadow mapping with PCF
 * - Rim lighting
 * - Underwater effects
 */
export const characterShader = `
  struct Camera { viewProjection: mat4x4f, position: vec3f, time: f32, cloudCoverage: f32, starBlur: f32, skyDarkening: f32, lightningFlash: f32, lightningPosX: f32, lightningPosY: f32, dayTime: f32 }
  struct Character { model: mat4x4f, color: vec3f, pad: f32 }
  struct Light { viewProjection: mat4x4f, position: vec3f, pad: f32 }
  @group(0) @binding(0) var<uniform> camera: Camera;
  @group(0) @binding(1) var<uniform> character: Character;
  @group(0) @binding(2) var avatarTex: texture_2d<f32>;
  @group(0) @binding(3) var avatarSampler: sampler;
  @group(0) @binding(4) var<storage, read> boneMatrices: array<mat4x4f>;
  @group(0) @binding(5) var<uniform> light: Light;
  @group(0) @binding(6) var shadowMap: texture_depth_2d;
  @group(0) @binding(7) var shadowSampler: sampler_comparison;

  struct VSIn { 
    @location(0) pos: vec3f, 
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
    @location(3) joints: vec4f,
    @location(4) weights: vec4f
  }
  struct VSOut { 
    @builtin(position) pos: vec4f, 
    @location(0) normal: vec3f,
    @location(1) worldPos: vec3f,
    @location(2) uv: vec2f,
    @location(3) shadowCoord: vec4f
  }

  @vertex fn vs(in: VSIn) -> VSOut {
    var o: VSOut;
    
    // Apply skeletal animation (skinning)
    var skinnedPos = vec3f(0.0);
    var skinnedNormal = vec3f(0.0);
    
    let totalWeight = in.weights.x + in.weights.y + in.weights.z + in.weights.w;
    
    if (totalWeight > 0.001) {
      // Get bone matrices for this vertex
      let bone0 = boneMatrices[u32(in.joints.x)];
      let bone1 = boneMatrices[u32(in.joints.y)];
      let bone2 = boneMatrices[u32(in.joints.z)];
      let bone3 = boneMatrices[u32(in.joints.w)];
      
      // Blend position
      skinnedPos += (bone0 * vec4f(in.pos, 1.0)).xyz * in.weights.x;
      skinnedPos += (bone1 * vec4f(in.pos, 1.0)).xyz * in.weights.y;
      skinnedPos += (bone2 * vec4f(in.pos, 1.0)).xyz * in.weights.z;
      skinnedPos += (bone3 * vec4f(in.pos, 1.0)).xyz * in.weights.w;
      
      // Blend normal
      skinnedNormal += (bone0 * vec4f(in.normal, 0.0)).xyz * in.weights.x;
      skinnedNormal += (bone1 * vec4f(in.normal, 0.0)).xyz * in.weights.y;
      skinnedNormal += (bone2 * vec4f(in.normal, 0.0)).xyz * in.weights.z;
      skinnedNormal += (bone3 * vec4f(in.normal, 0.0)).xyz * in.weights.w;
    } else {
      skinnedPos = in.pos;
      skinnedNormal = in.normal;
    }
    
    let worldPos = (character.model * vec4f(skinnedPos, 1.0)).xyz;
    o.pos = camera.viewProjection * vec4f(worldPos, 1.0);
    o.normal = normalize((character.model * vec4f(skinnedNormal, 0.0)).xyz);
    o.worldPos = worldPos;
    o.uv = in.uv;
    o.shadowCoord = light.viewProjection * vec4f(worldPos, 1.0);
    return o;
  }

  @fragment fn fs(in: VSOut) -> @location(0) vec4f {
    let normal = normalize(in.normal);
    
    // Dynamic sun direction based on time (day/night cycle)
    let cycleDuration = 120.0;  // Must match sky shader
    let timeOfDay = fract(camera.time / cycleDuration);
    let sunAngle = timeOfDay * 6.283185;
    let sunHeight = sin(sunAngle - 1.5708);
    let sunX = cos(sunAngle - 1.5708);
    let sunDir = normalize(vec3f(sunX, max(sunHeight, 0.05), 0.3));  // Clamp Y to avoid negative light
    
    // Moon direction (opposite side of sky from sun)
    let moonDir = normalize(vec3f(-sunX, max(-sunHeight, 0.05), -0.3));
    
    // Calculate day/night factor for lighting intensity
    var dayFactor = 0.0;
    if (timeOfDay >= 0.25 && timeOfDay <= 0.75) {
      dayFactor = 1.0;
    } else if (timeOfDay < 0.25) {
      dayFactor = smoothstep(0.15, 0.25, timeOfDay);
    } else {
      dayFactor = 1.0 - smoothstep(0.75, 0.85, timeOfDay);
    }
    let nightFactor = 1.0 - dayFactor;
    
    // Smooth blend between sun and moon light direction (no abrupt switch)
    // Use smoothstep for gradual transition centered at nightFactor = 0.5
    let lightBlend = smoothstep(0.3, 0.7, nightFactor);
    let lightDir = normalize(mix(sunDir, moonDir, lightBlend));
    
    // Light color: smooth transition from warm sunlight to cool moonlight
    let sunLightColor = vec3f(1.0, 0.98, 0.95);   // Warm sunlight
    let moonLightColor = vec3f(0.7, 0.8, 0.95);   // Blue-white moonlight
    let lightColor = mix(sunLightColor, moonLightColor, smoothstep(0.2, 0.8, nightFactor));
    
    // Sample texture
    let texColor = textureSample(avatarTex, avatarSampler, in.uv);
    
    // Shadow calculation
    let shadowNDC = in.shadowCoord.xyz / in.shadowCoord.w;
    let shadowUV = shadowNDC.xy * 0.5 + 0.5;
    let shadowDepth = shadowNDC.z - 0.008; // Larger bias for low sun angle on character
    
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
    
    // Basic diffuse lighting with shadows - use lightDir (sun or moon)
    // Moon provides softer, more directional light
    let moonIntensity = 0.75;
    // Smooth transition of light intensity (no abrupt switch)
    let lightIntensity = mix(1.0, moonIntensity, smoothstep(0.3, 0.7, nightFactor));
    let diff = max(dot(normal, lightDir), 0.0) * lightIntensity;
    let ambient = 0.30 + 0.18 * dayFactor;  // Higher base ambient for visible character at night
    
    // Reduce shadow intensity at night (moonlight creates softer shadows)
    shadow = mix(0.7, shadow, dayFactor * 0.8 + 0.2 * nightFactor);
    
    // Soften shadows underwater - scattered light makes shadows nearly invisible
    let waterLevel = 8.0;
    let characterUnderwater = in.worldPos.y < waterLevel;
    if (characterUnderwater) {
      let underwaterDepth = waterLevel - in.worldPos.y;
      let shadowFade = smoothstep(0.0, 30.0, underwaterDepth);
      shadow = mix(shadow, 1.0, 0.7 + shadowFade * 0.25); // 70-95% shadow reduction
    }
    
    // Lighting with shadow and light color
    let lighting = ambient + diff * (1.0 - ambient) * shadow;
    
    // Rim lighting for better silhouette - blue-tinted at night
    let viewDir = normalize(camera.position - in.worldPos);
    let rim = 1.0 - max(dot(viewDir, normal), 0.0);
    let rimLight = pow(rim, 3.0) * 0.15;
    let rimColor = mix(vec3f(0.6, 0.7, 0.9), vec3f(0.5, 0.6, 1.0), nightFactor);
    
    // Apply light color to the final lighting
    var col = texColor.rgb * (lighting * lightColor) + rimColor * rimLight;
    
    // Apply character color tint (for NPCs to differentiate from player)
    // Color multiplies with texture: white = no change, other colors = tint
    col = col * character.color;
    
    // Apply time-of-day color tint to character
    // Dawn/dusk: warm orange tint
    var dawnDuskFactor = 0.0;
    if (timeOfDay >= 0.2 && timeOfDay < 0.3) {
      dawnDuskFactor = smoothstep(0.2, 0.25, timeOfDay) * (1.0 - smoothstep(0.25, 0.3, timeOfDay));
    } else if (timeOfDay >= 0.7 && timeOfDay < 0.85) {
      dawnDuskFactor = smoothstep(0.7, 0.75, timeOfDay) * (1.0 - smoothstep(0.75, 0.85, timeOfDay));
    }
    
    // Warm tint at dawn/dusk
    let warmTint = vec3f(1.0, 0.85, 0.7);
    col = mix(col, col * warmTint, dawnDuskFactor * 0.4);
    
    // ============ UNDERWATER LIGHT SCATTERING + FOG FOR CHARACTER ============
    // waterLevel already declared above, reuse characterUnderwater
    let cameraUnderwater = camera.position.y < waterLevel;
    
    var finalAlpha = texColor.a;
    
    if (characterUnderwater && cameraUnderwater) {
      let distToCamera = length(in.worldPos - camera.position);
      
      // === VERY SUBTLE UNDERWATER EFFECT - CHARACTER STAYS FULLY VISIBLE ===
      // Minimal fog - just a hint of underwater atmosphere
      let fogDensity = 0.008;  // Much lower fog
      var fogAmount = 1.0 - exp(-distToCamera * fogDensity);
      fogAmount = min(fogAmount, 0.25);  // Cap fog to never exceed 25%
      
      // Luminous water color based on camera depth
      let cameraDepth = waterLevel - camera.position.y;
      let depthRatio = clamp(cameraDepth / 40.0, 0.0, 1.0);
      
      let surfaceWater = vec3f(0.25, 0.55, 0.55);
      let midWater = vec3f(0.18, 0.48, 0.50);
      let deepWaterCol = vec3f(0.12, 0.40, 0.45);
      
      var waterColor = mix(surfaceWater, midWater, smoothstep(0.0, 0.4, depthRatio));
      waterColor = mix(waterColor, deepWaterCol, smoothstep(0.4, 1.0, depthRatio));
      
      // Very subtle fog blend - character stays visible
      col = mix(col, waterColor, fogAmount * 0.5);
      
      // Minimal color absorption - uniform across the character
      let absorption = vec3f(0.97, 0.98, 1.0);  // Almost no absorption
      col *= absorption;
      
      // Subtle blue tint only
      col.b = col.b * 1.05 + 0.01;
      col.g = col.g * 1.02;
      
      // NO alpha fade - character always fully visible
      // finalAlpha stays unchanged
    }
    
    // === VIEWING UNDERWATER CHARACTER FROM ABOVE WATER ===
    // When camera is above water but character is underwater, apply blur/distortion effect
    // This simulates seeing through water - refraction, color shift, reduced clarity
    if (characterUnderwater && !cameraUnderwater) {
      // Calculate how deep the character is underwater
      let underwaterDepth = waterLevel - in.worldPos.y;
      let depthFactor = clamp(underwaterDepth / 15.0, 0.0, 1.0);
      
      // Underwater viewing color - strong blue-green tint like looking through water
      let underwaterViewColor = vec3f(0.08, 0.25, 0.45);
      
      // Strong color blend - water absorbs warm colors, passes cool colors
      let waterAbsorption = 0.4 + depthFactor * 0.35; // 40% to 75% water effect
      col = mix(col, underwaterViewColor, waterAbsorption);
      
      // Significantly reduce contrast - light scatters through water surface
      let avgBrightness = (col.r + col.g + col.b) / 3.0;
      col = mix(col, vec3f(avgBrightness), 0.3 + depthFactor * 0.3);
      
      // Strong blue-green color shift (water filters out red/orange)
      col.r = col.r * 0.65;  // Strong red absorption
      col.g = col.g * 1.1 + 0.04;  // Slight green boost
      col.b = col.b * 1.25 + 0.08;  // Strong blue boost
      
      // Heavy desaturation - underwater things look washed out
      let saturation = 0.5 - depthFactor * 0.25;
      let gray = dot(col, vec3f(0.299, 0.587, 0.114));
      col = mix(vec3f(gray), col, saturation);
      
      // Add slight "haze" overlay - like looking through murky water
      let hazeColor = vec3f(0.12, 0.28, 0.42);
      col = mix(col, hazeColor, depthFactor * 0.25);
      
      // Reduce visibility/alpha for deeper parts
      finalAlpha = finalAlpha * (0.85 - depthFactor * 0.25);
    }
    
    return vec4f(col, finalAlpha);
  }
`;
