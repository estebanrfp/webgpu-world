/**
 * Sky Shader Module - WGSL
 * 
 * Complete procedural sky rendering system with:
 * - Day/Night cycle with smooth transitions (dawn, day, dusk, night)
 * - Physically-based atmospheric scattering (Rayleigh + Mie)
 * - Dynamic sun with illusion effect (larger near horizon)
 * - Moon with phase and atmospheric halo
 * - Procedural star field with twinkling and spectral color variation
 * - Shooting stars with trails
 * - Aurora borealis with animated curtains
 * - Space nebulae and milky way
 * - Two-layer procedural cumulus clouds with FBM
 * - Cloud backlight and incandescence effects
 * - Lightning flashes with branching bolts
 * - Storm weather effects (sky darkening)
 * 
 * Uniforms (Camera struct):
 * - viewProjection: mat4x4f - Camera view-projection matrix
 * - position: vec3f - Camera world position
 * - time: f32 - Animation time
 * - cloudCoverage: f32 - Cloud density (0-1)
 * - starBlur: f32 - Star blur/size factor
 * - skyDarkening: f32 - Storm darkening intensity
 * - lightningFlash: f32 - Lightning flash intensity
 * - lightningPosX/Y: f32 - Lightning position
 */

export const skyShader = `
      struct Camera { viewProjection: mat4x4f, position: vec3f, time: f32, cloudCoverage: f32, starBlur: f32, skyDarkening: f32, lightningFlash: f32, lightningPosX: f32, lightningPosY: f32, dayTime: f32 }
      @group(0) @binding(0) var<uniform> camera: Camera;

      struct VSOut { @builtin(position) pos: vec4f, @location(0) clipPos: vec2f }

      @vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
        var p = array<vec2f, 6>(
          vec2f(-1,-1), vec2f(1,-1), vec2f(1,1),
          vec2f(-1,-1), vec2f(1,1), vec2f(-1,1)
        );
        var o: VSOut;
        o.pos = vec4f(p[i], 0.9999, 1.0);
        o.clipPos = p[i];
        return o;
      }

      // Compute inverse of 4x4 matrix (for viewProjection inversion)
      fn inverse4x4(m: mat4x4f) -> mat4x4f {
        let a00 = m[0][0]; let a01 = m[0][1]; let a02 = m[0][2]; let a03 = m[0][3];
        let a10 = m[1][0]; let a11 = m[1][1]; let a12 = m[1][2]; let a13 = m[1][3];
        let a20 = m[2][0]; let a21 = m[2][1]; let a22 = m[2][2]; let a23 = m[2][3];
        let a30 = m[3][0]; let a31 = m[3][1]; let a32 = m[3][2]; let a33 = m[3][3];

        let b00 = a00 * a11 - a01 * a10;
        let b01 = a00 * a12 - a02 * a10;
        let b02 = a00 * a13 - a03 * a10;
        let b03 = a01 * a12 - a02 * a11;
        let b04 = a01 * a13 - a03 * a11;
        let b05 = a02 * a13 - a03 * a12;
        let b06 = a20 * a31 - a21 * a30;
        let b07 = a20 * a32 - a22 * a30;
        let b08 = a20 * a33 - a23 * a30;
        let b09 = a21 * a32 - a22 * a31;
        let b10 = a21 * a33 - a23 * a31;
        let b11 = a22 * a33 - a23 * a32;

        let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
        let invDet = 1.0 / det;

        return mat4x4f(
          vec4f((a11 * b11 - a12 * b10 + a13 * b09) * invDet,
                (a02 * b10 - a01 * b11 - a03 * b09) * invDet,
                (a31 * b05 - a32 * b04 + a33 * b03) * invDet,
                (a22 * b04 - a21 * b05 - a23 * b03) * invDet),
          vec4f((a12 * b08 - a10 * b11 - a13 * b07) * invDet,
                (a00 * b11 - a02 * b08 + a03 * b07) * invDet,
                (a32 * b02 - a30 * b05 - a33 * b01) * invDet,
                (a20 * b05 - a22 * b02 + a23 * b01) * invDet),
          vec4f((a10 * b10 - a11 * b08 + a13 * b06) * invDet,
                (a01 * b08 - a00 * b10 - a03 * b06) * invDet,
                (a30 * b04 - a31 * b02 + a33 * b00) * invDet,
                (a21 * b02 - a20 * b04 - a23 * b00) * invDet),
          vec4f((a11 * b07 - a10 * b09 - a12 * b06) * invDet,
                (a00 * b09 - a01 * b07 + a02 * b06) * invDet,
                (a31 * b01 - a30 * b03 - a32 * b00) * invDet,
                (a20 * b03 - a21 * b01 + a22 * b00) * invDet)
        );
      }

      // Hash functions for procedural stars
      fn hash31(p: vec3f) -> f32 {
        var p3 = fract(p * 0.1031);
        p3 = p3 + dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      
      fn hash21(p: vec2f) -> f32 {
        var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
        p3 = p3 + dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      @fragment fn fs(in: VSOut) -> @location(0) vec4f {
        // Compute inverse of viewProjection to get world ray
        let invVP = inverse4x4(camera.viewProjection);
        
        // Transform clip space points to world space
        let nearWorld = invVP * vec4f(in.clipPos, -1.0, 1.0);
        let farWorld = invVP * vec4f(in.clipPos, 1.0, 1.0);
        
        // Perspective divide
        let near = nearWorld.xyz / nearWorld.w;
        let far = farWorld.xyz / farWorld.w;
        
        // Ray direction in world space
        let rayDir = normalize(far - near);
        
        // ============================================
        // Day/Night Cycle - Sun position based on time
        // ============================================
        let cycleDuration = 120.0;  // Full cycle in seconds
        let timeOfDay = fract(camera.dayTime / cycleDuration);  // 0-1 through the day (controllable)
        
        // Sun angle: 0 = midnight (below), 0.25 = dawn, 0.5 = noon, 0.75 = dusk
        let sunAngle = timeOfDay * 6.283185;  // Full rotation
        
        // Sun moves in an arc across the sky
        // Y component: sin gives height (negative at night = below horizon)
        // X component: cos gives east-west movement
        let sunHeight = sin(sunAngle - 1.5708);  // Offset so 0.25 = horizon rise
        let sunX = cos(sunAngle - 1.5708);
        let sunDir = normalize(vec3f(sunX, sunHeight, 0.3));  // Z offset for diagonal path
        
        // Moon is opposite to sun
        let moonDir = normalize(vec3f(-sunX, -sunHeight, -0.3));
        
        // ============================================
        // Determine time period for color blending
        // ============================================
        // timeOfDay: 0.0-0.2 = night, 0.2-0.3 = dawn, 0.3-0.7 = day, 0.7-0.8 = dusk, 0.8-1.0 = night
        var dayFactor = 0.0;
        var dawnFactor = 0.0;
        var duskFactor = 0.0;
        var nightFactor = 0.0;
        
        if (timeOfDay < 0.2) {
          // Night (first part)
          nightFactor = 1.0;
        } else if (timeOfDay < 0.3) {
          // Dawn transition
          let t = (timeOfDay - 0.2) / 0.1;
          nightFactor = 1.0 - t;
          dawnFactor = t;
        } else if (timeOfDay < 0.4) {
          // Dawn to day
          let t = (timeOfDay - 0.3) / 0.1;
          dawnFactor = 1.0 - t;
          dayFactor = t;
        } else if (timeOfDay < 0.65) {
          // Full day
          dayFactor = 1.0;
        } else if (timeOfDay < 0.75) {
          // Day to dusk
          let t = (timeOfDay - 0.65) / 0.1;
          dayFactor = 1.0 - t;
          duskFactor = t;
        } else if (timeOfDay < 0.85) {
          // Dusk transition
          let t = (timeOfDay - 0.75) / 0.1;
          duskFactor = 1.0 - t;
          nightFactor = t;
        } else {
          // Night (second part)
          nightFactor = 1.0;
        }
        
        // ============================================
        // Sky colors for each time period
        // Using atmospheric scattering model inspired by reference
        // ============================================
        // Day sky - Rayleigh scattering (blue dominates at zenith)
        let dayZenith = vec3f(0.05, 0.28, 0.95);     // Deep blue zenith
        let dayHorizon = vec3f(0.45, 0.65, 0.90);   // Lighter blue-white horizon
        
        // Dawn - warm reds/oranges scatter near horizon, purple at zenith
        let dawnZenith = vec3f(0.35, 0.2, 0.55);    // Purple/magenta
        let dawnHorizon = vec3f(1.0, 0.55, 0.25);   // Warm orange
        
        // Dusk - deeper reds, atmospheric absorption effect
        let duskZenith = vec3f(0.25, 0.12, 0.45);   // Deep purple
        let duskHorizon = vec3f(1.0, 0.38, 0.12);   // Deep orange/red
        
        // Night colors - deep blue with brighter cyan horizon (like reference image)
        let nightZenith = vec3f(0.02, 0.04, 0.10);      // Deep blue (not black)
        let nightHorizon = vec3f(0.08, 0.18, 0.28);     // Brighter cyan-blue at horizon
        
        // Calculate how much we're looking towards the sun vs away from it
        // Used to create hemisphere separation: sun side = warm, moon side = night blue
        let sunAlignment = dot(rayDir, sunDir);  // -1 = opposite to sun, +1 = towards sun
        // Smoother transition using wider smoothstep range for softer gradient
        let sunSideFactor = smoothstep(-0.4, 0.8, sunAlignment);  // Wider range = softer transition
        let moonSideFactor = 1.0 - sunSideFactor;  // 1 = moon side, 0 = sun side
        
        // During dawn/dusk, the moon side should show NIGHT colors (blue), not dawn colors
        // Sun side keeps full dawn/dusk warmth, moon side gets night blue
        // Use pow to make the transition even smoother at the boundary
        let softSunSide = pow(sunSideFactor, 1.5);  // Softer falloff
        let localDawnFactor = dawnFactor * softSunSide;  // Full dawn only on sun side
        let localDuskFactor = duskFactor * softSunSide;  // Full dusk only on sun side
        
        // Add night colors to moon side during dawn/dusk transitions
        // This creates the blue night sky on the moon's hemisphere
        // Smoother moon side night blending
        let softMoonSide = pow(moonSideFactor, 1.2);
        let moonSideNightBoost = softMoonSide * (dawnFactor + duskFactor);
        let localNightFactor = nightFactor + moonSideNightBoost;
        
        // Blend zenith and horizon colors based on time
        // Sun side: warm dawn/dusk colors, Moon side: night blue colors
        let zenithColor = dayZenith * dayFactor + dawnZenith * localDawnFactor + 
                          duskZenith * localDuskFactor + nightZenith * localNightFactor;
        let horizonColor = dayHorizon * dayFactor + dawnHorizon * localDawnFactor + 
                           duskHorizon * localDuskFactor + nightHorizon * localNightFactor;
        
        let groundColor = vec3f(0.12, 0.10, 0.08) * (0.3 + 0.7 * dayFactor + 0.4 * (localDawnFactor + localDuskFactor));
        
        // ============================================
        // Sky gradient - Atmospheric scattering model
        // Based on reference shader with exponential decay
        // ============================================
        let horizon = rayDir.y;
        let rd_y_clamped = max(horizon, 0.0);
        var skyColor: vec3f;
        
        if (horizon < 0.0) {
          // Below horizon - fog/ground blend
          let t = smoothstep(0.0, -0.3, horizon);
          skyColor = mix(horizonColor, groundColor, t);
          
          // Add subtle fog near horizon (from reference)
          let fogMix = 1.0 - exp(horizon * 80.0);
          skyColor = mix(skyColor * 1.1, vec3f(0.25, 0.22, 0.20) * (0.3 + dayFactor * 0.7), fogMix);
        } else {
          // Above horizon - atmospheric scattering
          
          // Atmospheric scattering colors from reference shader
          // Uses the exact color formulas for realistic sky
          var col = vec3f(0.0);
          
          // Warm red/orange scattering near horizon (Mie scattering)
          // col += 0.4, 0.35 - exp(-y*15)*0.15, 0.0 * exp(-y*7)
          col += vec3f(
            0.4,
            0.35 - exp(-rd_y_clamped * 15.0) * 0.15,
            0.0
          ) * exp(-rd_y_clamped * 7.0);
          
          // Blue Rayleigh scattering - exact colors from reference
          // col += 0.25, 0.45, 0.65 * (1 - exp(-y*6)) * exp(-y*0.8)
          col += vec3f(0.25, 0.45, 0.65) * (1.0 - exp(-rd_y_clamped * 6.0)) * exp(-rd_y_clamped * 0.8);
          
          // Smooth blend between night and day sky (no abrupt transitions)
          // Night sky calculation - faster transition to dark, concentrated at horizon
          let g = pow(smoothstep(0.0, 0.35, horizon), 0.8);
          var nightSky = mix(horizonColor, zenithColor, g);
          // Cyan-turquoise atmospheric glow near horizon at night (concentrated)
          let nightAtmosphere = exp(-horizon * 6.0) * 0.12;
          nightSky = nightSky + vec3f(0.05, 0.15, 0.22) * nightAtmosphere;
          // Additional subtle glow layer for depth (more concentrated)
          let horizonGlow = exp(-horizon * 15.0) * 0.08;
          nightSky = nightSky + vec3f(0.02, 0.12, 0.18) * horizonGlow;
          
          // Day sky calculation
          let dayAtmosphere = col * dayFactor;
          
          // Reduce warm atmosphere (orange glow) in the direction opposite to the sun
          // This prevents the orange sunrise/sunset glow from contaminating the moon area
          // Use a smoother, more gradual falloff for better blending
          let awayFromSun = 1.0 - max(0.0, dot(rayDir, sunDir));  // 1.0 when looking away from sun, 0.0 when looking at sun
          // Wider smoothstep range for much softer gradient between warm and cool sides
          let moonSideReduction = smoothstep(0.2, 0.9, awayFromSun);  // More gradual transition
          // Use pow to further soften the transition curve
          let smoothReduction = pow(moonSideReduction, 0.8);
          let warmAtmosphereReduction = mix(1.0, 0.08, smoothReduction * (dawnFactor + duskFactor));  // 92% reduction on moon side during dawn/dusk
          let warmAtmosphere = col * 1.3 * (dawnFactor + duskFactor) * warmAtmosphereReduction;
          
          var daySky = dayAtmosphere + warmAtmosphere;
          // Add slight horizon fog blend
          let horizonBlend = exp(-rd_y_clamped * 4.0) * 0.15;
          daySky = daySky + vec3f(0.7, 0.75, 0.8) * horizonBlend * dayFactor;
          
          // Smooth blend between night and day based on nightFactor
          skyColor = mix(daySky, nightSky, nightFactor);
        }
        
        // ============================================
        // PRE-CALCULATE CLOUD DENSITY for sun/star occlusion
        // Clouds calculated first so sun/moon/stars can be occluded by them
        // ============================================
        var cloudOcclusion = 0.0;  // 0 = clear sky, 1 = fully cloudy
        
        if (horizon > 0.0) {
          let cloudTime = camera.time * 0.015;
          let coverage = camera.cloudCoverage;
          
          // Extend cloud range to cover entire sky (horizon 0 to 1)
          let t1 = 0.12 / max(horizon, 0.01);
          
          let cloudUV1 = vec2f(
            rayDir.x * t1 * 1.2 + cloudTime * 0.8,
            rayDir.z * t1 * 1.2 + cloudTime * 0.2
          );
          
          // Simplified 3-octave FBM for occlusion calculation (fast)
          var cloudDensity = 0.0;
          var amp = 0.5;
          var p = cloudUV1;
          
          var i = floor(p * 3.0);
          var f = fract(p * 3.0);
          var u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          var a = hash21(i);
          var b = hash21(i + vec2f(1.0, 0.0));
          var c = hash21(i + vec2f(0.0, 1.0));
          var dd = hash21(i + vec2f(1.0, 1.0));
          cloudDensity += mix(mix(a, b, u.x), mix(c, dd, u.x), u.y) * amp;
          amp *= 0.5; p = p * 2.0 + vec2f(0.3, 0.7);
          
          i = floor(p * 3.0); f = fract(p * 3.0);
          u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          a = hash21(i); b = hash21(i + vec2f(1.0, 0.0));
          c = hash21(i + vec2f(0.0, 1.0)); dd = hash21(i + vec2f(1.0, 1.0));
          cloudDensity += mix(mix(a, b, u.x), mix(c, dd, u.x), u.y) * amp;
          amp *= 0.5; p = p * 2.0 + vec2f(-0.2, 0.4);
          
          i = floor(p * 3.0); f = fract(p * 3.0);
          u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          a = hash21(i); b = hash21(i + vec2f(1.0, 0.0));
          c = hash21(i + vec2f(0.0, 1.0)); dd = hash21(i + vec2f(1.0, 1.0));
          cloudDensity += mix(mix(a, b, u.x), mix(c, dd, u.x), u.y) * amp;
          
          let threshold = 0.25 + (1.0 - coverage) * 0.45;
          cloudOcclusion = smoothstep(threshold, threshold + 0.2, cloudDensity);
          
          // Height fade - clouds cover entire sky but fade at very top
          let heightFade = smoothstep(0.0, 0.08, horizon) * smoothstep(0.95, 0.6, horizon);
          cloudOcclusion = cloudOcclusion * heightFade;
        }
        
        // ============================================
        // Sun rendering (only when above horizon) - OCCLUDED BY CLOUDS
        // ============================================
        let sunDot = dot(rayDir, sunDir);
        // Sun stays bright until it goes below horizon - sharp cutoff, not gradual fade
        let sunVisible = smoothstep(-0.05, 0.02, sunDir.y);  // Quick fade only when touching horizon
        
        // Sun illusion effect: appears larger near horizon, smaller when high
        // This mimics the real "sun illusion" optical effect
        let sunAltitude = clamp(sunDir.y, 0.0, 1.0);
        // Scale factor: 2.5x at horizon (y=0), 1.0x at zenith (y=1) - dramatic effect
        let sunIllusion = 1.0 + (1.0 - sunAltitude) * 1.5;
        
        // Horizon factor for color and intensity changes
        let sunHorizonFactor = 1.0 - smoothstep(0.0, 0.35, sunDir.y);  // 1.0 at horizon, 0.0 when high
        
        // Sun color changes through the day - MORE orange at horizon
        let sunColorDay = vec3f(1.0, 0.99, 0.95);
        let sunColorSunrise = vec3f(1.0, 0.5, 0.15);   // Deeper orange at sunrise
        let sunColorSunset = vec3f(1.0, 0.35, 0.08);   // Even deeper orange/red at sunset
        
        var sunColor = sunColorDay;
        if (dawnFactor > 0.0) {
          sunColor = mix(sunColor, sunColorSunrise, dawnFactor);
        }
        if (duskFactor > 0.0) {
          sunColor = mix(sunColor, sunColorSunset, duskFactor);
        }
        // Also blend based on horizon position for smooth transition
        let sunColorHorizon = vec3f(1.0, 0.55, 0.2);
        sunColor = mix(sunColor, sunColorHorizon, sunHorizonFactor * 0.5);
        
        // Sun disk size - adjusted by illusion factor
        // Smaller base = tiny sun when high, larger when at horizon
        let baseSunCore = 0.99996;   // Smaller base core
        let baseSunEdge = 0.99998;   // Smaller base edge
        
        // Apply sun illusion - larger spread at horizon
        let sunCoreSpread = (1.0 - baseSunCore) * sunIllusion;
        let sunEdgeSpread = (1.0 - baseSunEdge) * sunIllusion;
        let sunCore = 1.0 - sunCoreSpread;
        let sunEdge = 1.0 - sunEdgeSpread;
        
        let sunDisk = smoothstep(sunCore, sunEdge, sunDot) * sunVisible;
        
        // Secondary softer disk around core - also scales
        let sunDisk2Core = 1.0 - (1.0 - 0.9998) * sunIllusion;
        let sunDisk2Edge = 1.0 - (1.0 - 0.99992) * sunIllusion;
        let sunDisk2 = smoothstep(sunDisk2Core, sunDisk2Edge, sunDot) * sunVisible * 0.6;
        
        // Horizon intensity boost - glow gets STRONGER near horizon
        let sunHorizonGlowBoost = 1.0 + sunHorizonFactor * 2.0;  // Up to 3x brighter at horizon
        
        // Sun glow layers - MUCH tighter when high, expand only at horizon
        // When sun is high (sunHorizonFactor=0), sunGlowScale=1.0, exponents are at max
        // When sun is at horizon (sunHorizonFactor=1), exponents are reduced for wider glow
        let sunGlowScale = 1.0 + sunHorizonFactor * 1.5;  // 1.0 when high (tight), 2.5 at horizon (looser)
        let sunGlowTight = pow(max(0.0, sunDot), 4096.0 / sunGlowScale) * sunVisible * 1.2 * sunHorizonGlowBoost;
        let sunGlowMed = pow(max(0.0, sunDot), 1200.0 / sunGlowScale) * sunVisible * 0.12 * sunHorizonGlowBoost;
        let sunGlowWide = pow(max(0.0, sunDot), 400.0 / sunGlowScale) * sunVisible * 0.03 * sunHorizonGlowBoost;  // Tighter
        
        // Very subtle sun rays - barely visible, natural diffraction effect
        let rayAngle = atan2(rayDir.x - sunDir.x, rayDir.z - sunDir.z);
        let rayPattern = pow(abs(sin(rayAngle * 6.0)), 12.0);  // 12 soft rays
        let rayIntensity = pow(max(0.0, sunDot), 1024.0 / sunGlowScale) * rayPattern * sunVisible * 0.02 * sunHorizonGlowBoost;
        
        // Extremely subtle spike pattern - almost imperceptible
        let spikePattern = pow(abs(sin(rayAngle * 4.0)), 24.0);  // 8 very soft spikes
        let spikeIntensity = pow(max(0.0, sunDot), 2048.0 / sunGlowScale) * spikePattern * sunVisible * 0.03 * sunHorizonGlowBoost;
        
        // Sun halo/corona - VERY tight when high, expands at horizon
        let sunHaloExponent = mix(500.0, 20.0, sunHorizonFactor);  // Even tighter when high (500)
        let sunHaloIntensity = mix(0.08, 0.25, sunHorizonFactor) + 0.1 * (dawnFactor + duskFactor);  // Less intense when high
        let sunHalo = pow(max(0.0, sunDot), sunHaloExponent) * sunHaloIntensity * sunVisible;
        let sunHaloColor = mix(vec3f(1.0, 0.98, 0.92), vec3f(1.0, 0.5, 0.2), sunHorizonFactor);  // Bright white-yellow when high, orange at horizon
        
        // Warm diffuse glow around sun - MUCH tighter, subtle
        let sunDiffuseGlow = pow(max(0.0, sunDot), 80.0) * sunVisible * 0.25;  // Tighter exponent
        let sunDiffuseColor = vec3f(1.0, 0.85, 0.6);  // Soft warm yellow
        
        // Sharp specular highlight at sun center - very tight
        let sunSpecular = pow(max(0.0, sunDot), 800.0) * sunVisible * 0.08;  // Much tighter
        
        // Orange/red atmospheric glow around sun at dawn/dusk - enhanced
        let atmosphericGlow = pow(max(0.0, sunDot), 4.0) * (dawnFactor + duskFactor + sunHorizonFactor * 0.5) * 0.6;
        let atmosphericColor = vec3f(1.0, 0.45, 0.15);
        
        // ============================================
        // CLOUD INCANDESCENCE SYSTEM
        // Subtle glow where sun illuminates clouds from behind
        // NO sharp edges - smooth gradient only
        // ============================================
        
        // Base sun occlusion - how much clouds block the sun
        let sunOcclusion = 1.0 - cloudOcclusion * 0.99;  // 99% blocked when fully cloudy
        
        // Diffusion factor - sun becomes blurrier through clouds
        let cloudDiffusion = cloudOcclusion * 0.95;  // Very aggressive diffusion
        
        // Cloud incandescence - VERY subtle, smooth gradient, no edges
        // Uses high exponent for tight area, low intensity for subtle effect
        let sunProximity = pow(max(0.0, sunDot), 8.0);  // Tighter spread (was 2.0)
        let incandescenceStrength = sunProximity * cloudOcclusion * sunVisible;
        
        // Incandescence color - warm tones
        let incandescenceColorHigh = vec3f(1.0, 0.95, 0.9);  // Warm white
        let incandescenceColorLow = vec3f(1.0, 0.75, 0.5);   // Warm orange
        let incandescenceColor = mix(incandescenceColorHigh, incandescenceColorLow, sunHorizonFactor);
        
        // Sun light amount based on sun height
        let sunLightForIncandescence = max(0.0, sunDir.y);
        
        // Apply incandescence - MUCH more subtle, no visible circle
        let incandescence = incandescenceColor * incandescenceStrength * 0.4 * sunLightForIncandescence;  // Reduced from 1.2 to 0.4
        skyColor = skyColor + incandescence;
        
        // NO diffused sun glow through clouds - this was creating the giant circle
        // The clouds themselves provide the diffuse lighting effect
        
        // Sharp sun elements - heavily reduced when clouds are present
        let sharpOcclusion = sunOcclusion * (1.0 - cloudDiffusion);  // Extra reduction for sharp elements
        
        // Combine sun elements - keep the sun SMALL
        skyColor = skyColor + sunColor * sunDisk * 10.0 * sharpOcclusion;      // Bright core - very occluded
        skyColor = skyColor + sunColor * sunDisk2 * 4.0 * sharpOcclusion;      // Secondary disk - very occluded
        skyColor = skyColor + sunColor * sunGlowTight * sharpOcclusion;        // Tight glow - very occluded
        skyColor = skyColor + sunColor * sunGlowMed * sharpOcclusion;          // Medium glow - very occluded
        skyColor = skyColor + sunColor * sunGlowWide * sunOcclusion * 0.5;     // Wide glow - reduced
        skyColor = skyColor + sunColor * rayIntensity * sharpOcclusion;        // Subtle rays - very occluded
        skyColor = skyColor + sunColor * spikeIntensity * sharpOcclusion;      // Sharp spikes - very occluded
        skyColor = skyColor + sunHaloColor * sunHalo * sharpOcclusion;         // Colored halo - very occluded
        skyColor = skyColor + atmosphericColor * atmosphericGlow * sunOcclusion * 0.6;  // Atmospheric - reduced
        skyColor = skyColor + sunDiffuseColor * sunDiffuseGlow * sunOcclusion; // Soft diffuse glow
        skyColor = skyColor + vec3f(1.0) * sunSpecular * sharpOcclusion;       // Sharp specular - very occluded
        
        // Horizon glow at sunset/sunrise - reduced on the opposite side of the sun (where moon is)
        // This prevents orange contamination of the moonrise/moonset
        let horizonAwayFromSun = 1.0 - max(0.0, dot(rayDir, sunDir));
        let horizonMoonSideReduction = smoothstep(0.5, 1.0, horizonAwayFromSun);
        let horizonGlowReduction = mix(1.0, 0.1, horizonMoonSideReduction);  // 90% reduction on moon side
        let horizonGlow = exp(-abs(horizon) * 3.5) * (dawnFactor + duskFactor) * 0.6 * horizonGlowReduction;
        skyColor = skyColor + atmosphericColor * horizonGlow;
        
        // ============================================
        // Moon rendering - Luminous and radiant
        // ============================================
        let moonDot = dot(rayDir, moonDir);
        // Moon visibility - only fade when actually below horizon
        let moonHeightFactor = smoothstep(-0.15, 0.0, moonDir.y);  // Only fade when going below horizon
        let moonVisible = moonHeightFactor * nightFactor;
        
        // Moon illusion effect: appears larger near horizon, smaller when high
        // This mimics the real "moon illusion" optical effect
        let moonHeight = clamp(moonDir.y, 0.0, 1.0);
        // Scale factor: 2.0x at horizon (y=0), 1.0x at zenith (y=1) - more dramatic effect
        let moonIllusion = 1.0 + (1.0 - moonHeight) * 1.0;
        
        // Horizon color shift - moon turns pale blue/silver near horizon (cool moonlight)
        let horizonFactor = 1.0 - smoothstep(0.0, 0.4, moonDir.y);  // 1.0 at horizon, 0.0 when high
        let moonColorHigh = vec3f(0.95, 0.97, 1.0);    // Cool white when high
        let moonColorLow = vec3f(0.75, 0.85, 1.0);     // Pale blue/silver at horizon (cold moonlight)
        let moonColor = mix(moonColorHigh, moonColorLow, horizonFactor);
        
        // Base moon size - adjusted by illusion factor
        // Much smaller base = tiny moon when high, larger when low
        let baseMoonCore = 0.99996;    // Much smaller base core
        let baseMoonEdge = 0.99998;    // Much smaller base edge
        
        // Apply moon illusion - larger spread at horizon
        let moonCoreSpread = (1.0 - baseMoonCore) * moonIllusion;
        let moonEdgeSpread = (1.0 - baseMoonEdge) * moonIllusion;
        let moonCore = 1.0 - moonCoreSpread;
        let moonEdge = 1.0 - moonEdgeSpread;
        
        // Inner bright disk - FULL brightness, no reduction at horizon
        let moonDisk = smoothstep(moonCore, moonEdge, moonDot) * moonVisible;
        
        // Horizon intensity boost - glow gets STRONGER near horizon, not weaker
        let horizonGlowBoost = 1.0 + horizonFactor * 1.5;  // Up to 2.5x brighter at horizon
        
        // Soft outer glow - scales with moon size, BRIGHTER at horizon
        // Lower exponents at horizon = wider glow
        let glowScale = 1.0 / moonIllusion;  // Tighter glow when high, looser at horizon
        let moonGlowInner = pow(max(0.0, moonDot), 2000.0 * glowScale) * moonVisible * 1.0 * horizonGlowBoost;
        let moonGlowOuter = pow(max(0.0, moonDot), 600.0 * glowScale) * moonVisible * 0.2 * horizonGlowBoost;
        let moonGlowWide = pow(max(0.0, moonDot), 150.0 * glowScale) * moonVisible * 0.08 * horizonGlowBoost;
        
        // Atmospheric halo - cool blue/white halo at horizon (moonlight scattering)
        let moonHaloExponent = mix(30.0, 12.0, horizonFactor);  // Wider halo at horizon
        let moonHaloIntensity = mix(0.03, 0.12, horizonFactor);  // Stronger at horizon
        let moonHalo = pow(max(0.0, moonDot), moonHaloExponent * glowScale) * moonVisible * moonHaloIntensity;
        let moonHaloColor = mix(vec3f(0.7, 0.8, 1.0), vec3f(0.6, 0.75, 1.0), horizonFactor);  // Blue-white halo
        
        // Apply cloud occlusion to moon - moon appears behind clouds
        let moonOcclusion = 1.0 - cloudOcclusion * 0.9;  // 90% blocked when fully cloudy
        
        // Combine moon layers with cloud occlusion - core maintains full brightness
        skyColor = skyColor + moonColor * moonDisk * 4.0 * moonOcclusion;           // Bright core
        skyColor = skyColor + moonColor * moonGlowInner * moonOcclusion;            // Inner glow
        skyColor = skyColor + moonColor * moonGlowOuter * moonOcclusion;            // Outer glow
        skyColor = skyColor + moonColor * moonGlowWide * moonOcclusion;             // Wide diffuse glow
        skyColor = skyColor + moonHaloColor * moonHalo * moonOcclusion;             // Atmospheric halo
        
        // ============================================
        // Stars - Truly circular points with soft glow
        // ============================================
        if (nightFactor > 0.01 && horizon > 0.0) {
          // Create star field using hash function
          let starCoord = floor(rayDir * 500.0);  // Star grid
          let starHash = hash31(starCoord);
          
          // Only some cells have stars
          if (starHash > 0.995) {
            // Star position - random offset within cell for variety
            let cellOffset = vec3f(
              fract(starHash * 127.1) - 0.5,
              fract(starHash * 311.7) - 0.5,
              fract(starHash * 74.7) - 0.5
            ) * 0.8;  // Keep away from edges
            let starWorldPos = (starCoord + 0.5 + cellOffset) / 500.0;
            let starDir = normalize(starWorldPos);
            
            // Angular distance from ray to star (proper spherical distance)
            let dotProduct = dot(rayDir, starDir);
            let angularDist = acos(clamp(dotProduct, -1.0, 1.0));
            
            // Convert to screen-space-like distance for consistent star size
            let screenDist = angularDist * 1200.0;
            
            // Circular gaussian blur - pure radial falloff
            let baseRadius = 0.8 + (starHash - 0.995) * 40.0;
            let starRadius = baseRadius * camera.starBlur;
            let blur = exp(-screenDist * screenDist / (starRadius * starRadius));
            
            // Star brightness
            let baseBrightness = (starHash - 0.995) / 0.005 * 0.5;
            
            // === TWINKLING EFFECT ===
            // Only ~8% of stars twinkle (few, well distributed)
            let twinkleHash = fract(starHash * 73.19);
            var twinkle = 1.0;
            if (twinkleHash > 0.92) {
              // Multiple sine waves for irregular twinkling
              let twinkleSpeed1 = 2.0 + twinkleHash * 4.0;
              let twinkleSpeed2 = 5.0 + fract(starHash * 31.7) * 3.0;
              let twinkleSpeed3 = 0.5 + fract(starHash * 47.3) * 1.5;
              let phase = fract(starHash * 91.3) * 6.28318;
              
              let t1 = sin(camera.time * twinkleSpeed1 + phase) * 0.35;
              let t2 = sin(camera.time * twinkleSpeed2 + phase * 2.1) * 0.25;
              let t3 = sin(camera.time * twinkleSpeed3 + phase * 0.7) * 0.15;
              
              twinkle = 0.5 + t1 + t2 + t3;  // Varies from ~0.0 to ~1.25
              twinkle = max(0.05, twinkle);  // Almost disappear at minimum
            }
            
            // Fade stars near horizon
            let starFade = smoothstep(0.0, 0.2, horizon);
            
            // Fade stars ONLY where moon disk is (not a large halo)
            // moonDot > 0.9997 is approximately where the moon disk is
            let moonProximity = max(0.0, moonDot);
            let moonDiskOcclusion = smoothstep(0.9995, 0.9999, moonProximity);  // Only occlude at moon disk
            let moonFade = 1.0 - moonDiskOcclusion * moonVisible;
            
            // Apply cloud occlusion to stars - stars appear behind clouds
            let starCloudFade = 1.0 - cloudOcclusion;
            
            let starIntensity = baseBrightness * blur * starFade * nightFactor * moonFade * starCloudFade * twinkle;
            
            // Realistic star color variation based on spectral class
            // Use second hash for color variety
            let colorHash = fract(starHash * 127.1);
            var starColor = vec3f(1.0, 1.0, 1.0);
            
            if (colorHash > 0.92) {
              // Red giants / M-class (rare, reddish-orange)
              starColor = vec3f(1.0, 0.6, 0.3);
            } else if (colorHash > 0.82) {
              // K-class (orange)
              starColor = vec3f(1.0, 0.75, 0.5);
            } else if (colorHash > 0.70) {
              // G-class like our Sun (yellow-white)
              starColor = vec3f(1.0, 0.95, 0.8);
            } else if (colorHash > 0.55) {
              // F-class (warm white)
              starColor = vec3f(1.0, 0.98, 0.95);
            } else if (colorHash > 0.35) {
              // A-class (pure white with hint of blue)
              starColor = vec3f(0.95, 0.97, 1.0);
            } else if (colorHash > 0.15) {
              // B-class (blue-white)
              starColor = vec3f(0.8, 0.88, 1.0);
            } else {
              // O-class (blue, rare)
              starColor = vec3f(0.7, 0.8, 1.0);
            }
            
            skyColor = skyColor + starColor * starIntensity;
          }
          
          // Add some larger, brighter stars (fewer) - also circular
          let bigStarCoord = floor(rayDir * 180.0);
          let bigStarHash = hash31(bigStarCoord);
          
          if (bigStarHash > 0.997) {
            // Random position within cell
            let bigCellOffset = vec3f(
              fract(bigStarHash * 83.1) - 0.5,
              fract(bigStarHash * 217.3) - 0.5,
              fract(bigStarHash * 59.7) - 0.5
            ) * 0.7;
            let bigStarWorldPos = (bigStarCoord + 0.5 + bigCellOffset) / 180.0;
            let bigStarDir = normalize(bigStarWorldPos);
            
            // Angular distance for proper circular shape
            let bigDotProduct = dot(rayDir, bigStarDir);
            let bigAngularDist = acos(clamp(bigDotProduct, -1.0, 1.0));
            let bigScreenDist = bigAngularDist * 800.0;
            
            // Larger circular blur
            let baseSize = 1.0 + (bigStarHash - 0.997) * 60.0;
            let starSize = baseSize * camera.starBlur;
            let blur = exp(-bigScreenDist * bigScreenDist / (starSize * starSize));
            
            let baseBrightness = (bigStarHash - 0.997) / 0.003 * 0.5;
            let starFade = smoothstep(0.0, 0.15, horizon);
            
            // === TWINKLING for bright stars (only ~15%, more subtle) ===
            let bigTwinkleHash = fract(bigStarHash * 51.7);
            var bigTwinkle = 1.0;
            if (bigTwinkleHash > 0.85) {
              let tSpeed = 1.2 + bigTwinkleHash * 1.5;
              let tPhase = fract(bigStarHash * 83.1) * 6.28318;
              bigTwinkle = 0.7 + sin(camera.time * tSpeed + tPhase) * 0.3;
            }
            
            // Fade stars ONLY where moon disk is (not a large halo)
            let bigMoonProximity = max(0.0, moonDot);
            let bigMoonDiskOcclusion = smoothstep(0.9995, 0.9999, bigMoonProximity);
            let moonFade = 1.0 - bigMoonDiskOcclusion * moonVisible;
            
            // Apply cloud occlusion to big stars too
            let bigStarCloudFade = 1.0 - cloudOcclusion;
            
            let starIntensity = baseBrightness * blur * starFade * nightFactor * moonFade * bigStarCloudFade * bigTwinkle;
            
            // Bright stars - more prominent colors (giants and supergiants)
            let colorHash = fract(bigStarHash * 93.7);
            var starColor = vec3f(1.0, 1.0, 1.0);
            
            if (colorHash > 0.85) {
              // Red supergiant (Betelgeuse-like)
              starColor = vec3f(1.0, 0.5, 0.25);
            } else if (colorHash > 0.70) {
              // Orange giant (Arcturus-like)
              starColor = vec3f(1.0, 0.7, 0.4);
            } else if (colorHash > 0.50) {
              // Yellow (Capella-like)
              starColor = vec3f(1.0, 0.9, 0.6);
            } else if (colorHash > 0.30) {
              // White (Sirius-like)
              starColor = vec3f(0.95, 0.98, 1.0);
            } else if (colorHash > 0.10) {
              // Blue-white (Rigel-like)
              starColor = vec3f(0.75, 0.85, 1.0);
            } else {
              // Blue (Spica-like)
              starColor = vec3f(0.65, 0.75, 1.0);
            }
            
            skyColor = skyColor + starColor * starIntensity;
          }
          
          // ============================================
          // SHOOTING STARS - Tiny falling points with fading trail
          // ============================================
          for (var starFallIdx = 0u; starFallIdx < 2u; starFallIdx = starFallIdx + 1u) {
            let fallSeed = f32(starFallIdx) * 23.17;
            
            // Each shooting star appears every 15-30 seconds
            let fallInterval = 15.0 + hash21(vec2f(fallSeed, 1.0)) * 15.0;
            let fallPhase = fract(camera.time / fallInterval + hash21(vec2f(fallSeed, 2.0)));
            
            // Visible for a brief moment (0.0 to 0.035 = ~0.5-1 second)
            if (fallPhase < 0.035) {
              let cycleNum = floor(camera.time / fallInterval + hash21(vec2f(fallSeed, 2.0)));
              
              // Start position - high in sky (never reaches horizon)
              let startAzimuth = hash21(vec2f(fallSeed + cycleNum, 3.0)) * 6.28318;
              let startElev = 0.6 + hash21(vec2f(fallSeed + cycleNum, 4.0)) * 0.35;  // 0.6-0.95 (high up)
              
              // Travel direction - slight diagonal, short distance
              let travelDir = hash21(vec2f(fallSeed + cycleNum, 5.0)) * 0.3 - 0.15;
              let fallSpeed = 0.15 + hash21(vec2f(fallSeed + cycleNum, 6.0)) * 0.1;  // Short fall
              
              let progress = fallPhase / 0.035;  // 0 to 1
              
              // Current position of the falling star
              let currentAzimuth = startAzimuth + travelDir * progress;
              let currentElev = startElev - fallSpeed * progress;  // Falls but stays high
              
              // Convert to 3D direction
              let cosElev = cos(currentElev * 1.5708);
              let sinElev = sin(currentElev * 1.5708);
              let starPos = normalize(vec3f(
                cos(currentAzimuth) * cosElev,
                sinElev,
                sin(currentAzimuth) * cosElev
              ));
              
              // Distance from ray to star head
              let distToStar = length(rayDir - starPos);
              
              // Tiny bright point (like a small star)
              let pointSize = 0.0025;
              let pointGlow = exp(-distToStar * distToStar / (pointSize * pointSize));
              
              // Very thin trail behind - just 4 fading points
              var trailGlow = 0.0;
              for (var trailStep = 1u; trailStep <= 4u; trailStep = trailStep + 1u) {
                let trailT = f32(trailStep) / 4.0;
                let trailProgress = progress - trailT * 0.25;
                if (trailProgress > 0.0) {
                  let trailAzimuth = startAzimuth + travelDir * trailProgress;
                  let trailElev = startElev - fallSpeed * trailProgress;
                  let trailCosElev = cos(trailElev * 1.5708);
                  let trailSinElev = sin(trailElev * 1.5708);
                  let trailPos = normalize(vec3f(
                    cos(trailAzimuth) * trailCosElev,
                    trailSinElev,
                    sin(trailAzimuth) * trailCosElev
                  ));
                  
                  let distToTrail = length(rayDir - trailPos);
                  let trailSize = 0.002 * (1.0 - trailT * 0.6);  // Very thin
                  let trailPoint = exp(-distToTrail * distToTrail / (trailSize * trailSize));
                  trailGlow = trailGlow + trailPoint * (1.0 - trailT * trailT) * 0.25;
                }
              }
              
              // Combine head and trail
              let totalGlow = pointGlow + trailGlow;
              
              // Fade out strongly at end (disappears before reaching horizon)
              let fadeIn = smoothstep(0.0, 0.1, progress);
              let fadeOut = smoothstep(1.0, 0.4, progress);  // Strong fadeout
              
              if (totalGlow > 0.01) {
                // White color like stars
                let shootingStarColor = vec3f(1.0, 1.0, 1.0);
                let brightness = totalGlow * fadeIn * fadeOut * 0.7;
                
                // Cloud occlusion
                let fallCloudFade = 1.0 - cloudOcclusion * 0.9;
                
                skyColor = skyColor + shootingStarColor * brightness * nightFactor * fallCloudFade;
              }
            }
          }
        }
        
        // ============================================
        // Atmospheric scattering
        // ============================================
        let scatterAmount = 0.15 * dayFactor + 0.05 * (dawnFactor + duskFactor);
        let scatter = exp(-max(0.0, horizon) * 3.0) * scatterAmount;
        let scatterColor = vec3f(0.95, 0.92, 0.88) * dayFactor + 
                           vec3f(1.0, 0.7, 0.5) * (dawnFactor + duskFactor);
        skyColor = mix(skyColor, scatterColor, scatter);
        
        // Night atmospheric glow - subtle deep blue gradient enhancement
        // Gradually increases with nightFactor (no abrupt threshold)
        let nightGlowFade = smoothstep(0.2, 0.6, nightFactor);
        let nightGlow = exp(-horizon * 8.0) * nightGlowFade * 0.02;
        skyColor = skyColor + vec3f(0.03, 0.05, 0.12) * nightGlow;
        
        // ============================================
        // AURORA BOREALIS - Animated dancing lights in the night sky
        // ============================================
        if (nightFactor > 0.3 && horizon > 0.05) {
          // Multiple time scales for varied animation
          let auroraTimeSlow = camera.time * 0.05;    // Slow undulation
          let auroraTimeMed = camera.time * 0.15;     // Medium flow
          let auroraTimeFast = camera.time * 0.4;     // Fast shimmer
          let auroraTimePulse = camera.time * 0.08;   // Brightness pulse
          
          // Aurora appears in bands across the sky
          let auroraX = rayDir.x * 2.0 + rayDir.z * 0.5;
          let auroraY = horizon;
          
          // Animated displacement - aurora curtains sway side to side
          let swayAmount = sin(auroraTimeSlow) * 0.3 + sin(auroraTimeSlow * 1.7) * 0.15;
          let animatedX = auroraX + swayAmount;
          
          // Vertical stretching animation - aurora extends and contracts
          let verticalStretch = 1.0 + sin(auroraTimeMed * 0.5) * 0.15;
          let animatedY = auroraY * verticalStretch;
          
          // Multiple wave layers with animated phases for flowing curtain
          let phase1 = auroraTimeMed * 0.8;
          let phase2 = auroraTimeMed * 1.2 + sin(auroraTimeSlow) * 0.5;
          let phase3 = auroraTimeMed * 0.6 - sin(auroraTimeSlow * 0.7) * 0.3;
          let phase4 = auroraTimeMed * 0.9 + cos(auroraTimeSlow * 1.3) * 0.4;
          
          let wave1 = sin(animatedX * 3.0 + phase1) * 0.5 + 0.5;
          let wave2 = sin(animatedX * 5.0 - phase2 + 1.5) * 0.5 + 0.5;
          let wave3 = sin(animatedX * 7.0 + phase3 + 3.0) * 0.5 + 0.5;
          let wave4 = sin(animatedX * 2.0 - phase4 + 2.0) * 0.5 + 0.5;
          
          // Combine waves with animated weights
          let weightOsc = sin(auroraTimePulse) * 0.1;
          let waveCombined = wave1 * (0.4 + weightOsc) + wave2 * (0.3 - weightOsc * 0.5) + 
                             wave3 * (0.2 + weightOsc * 0.3) + wave4 * 0.1;
          
          // Animated vertical bands - aurora height varies over time
          let heightOsc = sin(auroraTimeSlow * 0.7) * 0.1;
          let verticalMask = smoothstep(0.1 - heightOsc, 0.3, animatedY) * 
                             smoothstep(0.85 + heightOsc, 0.5, animatedY);
          
          // Horizontal variation with animated movement
          let horzPhase = auroraTimeMed * 0.3;
          let horzNoise1 = sin(animatedX * 1.5 + horzPhase) * 0.5 + 0.5;
          let horzNoise2 = sin(animatedX * 0.8 - horzPhase * 0.7 + 1.0) * 0.5 + 0.5;
          let horzMask = horzNoise1 * 0.6 + horzNoise2 * 0.4;
          
          // Dynamic shimmer - faster sparkle effect moving up the curtains
          let shimmerY = animatedY * 25.0 - auroraTimeFast * 3.0;  // Upward movement
          let shimmerX = animatedX * 8.0 + sin(auroraTimeMed) * 2.0;
          let shimmer = sin(shimmerY + shimmerX) * 0.12 + 
                        sin(shimmerY * 1.7 - shimmerX * 0.5) * 0.08 + 0.8;
          
          // Pulsing brightness - aurora brightens and dims
          let brightnessPulse = 0.85 + sin(auroraTimePulse * 1.3) * 0.1 + 
                                       sin(auroraTimePulse * 2.1 + animatedX) * 0.05;
          
          // Aurora intensity with all animations combined
          let auroraIntensity = waveCombined * verticalMask * horzMask * shimmer * 
                                brightnessPulse * nightFactor * 0.38;
          
          // Aurora colors with animated color shifts
          let colorTime = auroraTimeSlow * 0.5;
          let greenCore = vec3f(0.1, 0.85 + sin(colorTime) * 0.1, 0.3);
          let blueEdge = vec3f(0.2, 0.4, 0.85 + sin(colorTime * 1.3) * 0.1);
          let purpleEdge = vec3f(0.55 + sin(colorTime * 0.7) * 0.1, 0.2, 0.8);
          let pinkHint = vec3f(0.9, 0.3, 0.5);
          
          // Animated color mixing based on height and wave position
          let colorMix1 = smoothstep(0.2, 0.4, animatedY);
          let colorMix2 = smoothstep(0.5, 0.7, animatedY);
          let colorWave = sin(animatedX * 4.0 + auroraTimeMed * 0.8) * 0.5 + 0.5;
          
          // Color flows through the aurora
          let colorFlow = sin(animatedX * 2.0 - auroraTimeMed) * 0.5 + 0.5;
          
          var auroraColor = greenCore;
          auroraColor = mix(auroraColor, blueEdge, colorMix1 * (0.35 + colorFlow * 0.15));
          auroraColor = mix(auroraColor, purpleEdge, colorMix2 * (0.45 + colorFlow * 0.1));
          auroraColor = mix(auroraColor, pinkHint, colorWave * colorMix2 * 0.25);
          
          // Add aurora to sky
          skyColor = skyColor + auroraColor * auroraIntensity;
          
          // Animated glow around aurora
          let glowPulse = 0.25 + sin(auroraTimePulse * 0.9) * 0.08;
          let auroraGlow = auroraIntensity * glowPulse;
          skyColor = skyColor + vec3f(0.04, 0.12, 0.08) * auroraGlow;
        }
        
        // ============================================
        // SPACE NEBULAE - Subtle cosmic clouds for depth
        // Smoothly fade in as night approaches
        // ============================================
        let nebulaVisibility = smoothstep(0.3, 0.7, nightFactor) * smoothstep(0.05, 0.2, horizon);
        if (nebulaVisibility > 0.01) {
          let nebulaTime = camera.time * 0.01;  // Very slow drift
          
          // Create layered noise for nebula clouds
          let n1 = rayDir * 2.0;
          let n2 = rayDir * 4.0;
          let n3 = rayDir * 8.0;
          
          // Procedural noise using hash
          let noise1 = hash21(vec2f(floor(n1.x * 10.0) + floor(n1.z * 10.0) * 57.0 + nebulaTime, 
                                    floor(n1.y * 10.0) + 17.0));
          let noise2 = hash21(vec2f(floor(n2.x * 10.0) + floor(n2.z * 10.0) * 57.0 - nebulaTime * 0.5, 
                                    floor(n2.y * 10.0) + 31.0));
          let noise3 = hash21(vec2f(floor(n3.x * 10.0) + floor(n3.z * 10.0) * 57.0 + nebulaTime * 0.3, 
                                    floor(n3.y * 10.0) + 47.0));
          
          // Combine noise octaves
          let nebulaPattern = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
          
          // Only show in certain regions (sparse nebulae)
          let nebulaMask = smoothstep(0.55, 0.75, nebulaPattern);
          let heightMask = smoothstep(0.15, 0.4, horizon) * smoothstep(0.95, 0.6, horizon);
          
          // Nebula colors - deep space purples, blues, magentas
          let nebula1 = vec3f(0.15, 0.05, 0.25);   // Deep purple
          let nebula2 = vec3f(0.08, 0.1, 0.2);     // Dark blue
          let nebula3 = vec3f(0.2, 0.08, 0.15);    // Dark magenta
          
          // Mix colors based on position
          let colorVar = hash21(vec2f(floor(rayDir.x * 5.0), floor(rayDir.z * 5.0)));
          var nebulaColor = nebula1;
          if (colorVar > 0.6) {
            nebulaColor = nebula2;
          } else if (colorVar > 0.3) {
            nebulaColor = nebula3;
          }
          
          // Very subtle nebula - shouldn't overpower stars
          // Uses nebulaVisibility for smooth fade-in
          let nebulaIntensity = nebulaMask * heightMask * nebulaVisibility * 0.15;
          skyColor = skyColor + nebulaColor * nebulaIntensity;
          
          // Milky way band - subtle bright region
          let milkyWayAngle = atan2(rayDir.z, rayDir.x);
          let milkyWayBand = exp(-pow((milkyWayAngle - 0.5) * 2.0, 2.0) * 2.0);
          let milkyWayHeight = smoothstep(0.2, 0.5, horizon) * smoothstep(0.8, 0.5, horizon);
          let milkyWay = milkyWayBand * milkyWayHeight * nebulaVisibility * 0.03;
          skyColor = skyColor + vec3f(0.1, 0.12, 0.18) * milkyWay;
          
          // Distant galaxy hints - very subtle bright spots
          let galaxyCoord = floor(rayDir * 50.0);
          let galaxyHash = hash31(galaxyCoord);
          if (galaxyHash > 0.9995 && horizon > 0.3) {
            let galaxyBrightness = (galaxyHash - 0.9995) / 0.0005;
            let galaxyGlow = exp(-length(fract(rayDir * 50.0) - 0.5) * 8.0);
            let galaxyColor = vec3f(0.8, 0.75, 0.9);  // Soft lavender
            skyColor = skyColor + galaxyColor * galaxyBrightness * galaxyGlow * nebulaVisibility * 0.2;
          }
        }
        
        // ============================================
        // PROCEDURAL CLOUDS - Two-layer cumulus system (visible day and night)
        // Extended to cover entire sky dome
        // ============================================
        if (horizon > 0.0) {
          let cloudTime = camera.time * 0.015;  // Faster cloud drift (was 0.006)
          
          // Cloud coverage from uniform (0 = clear, 1 = full)
          let coverage = camera.cloudCoverage;
          
          // Project ray onto cloud plane - adjusted for full sky coverage
          let t1 = 0.12 / max(horizon, 0.01);  // Lower cloud layer
          let t2 = 0.18 / max(horizon, 0.01);  // Higher cloud layer
          
          // === LAYER 1: Main cumulus clouds (larger, slower) ===
          let cloudUV1 = vec2f(
            rayDir.x * t1 * 1.2 + cloudTime * 0.8,
            rayDir.z * t1 * 1.2 + cloudTime * 0.2
          );
          
          // FBM for layer 1 - 5 octaves for smooth, connected clouds
          var cloud1 = 0.0;
          var amp1 = 0.5;
          var p1 = cloudUV1;
          
          // Octave 1 (largest shapes)
          var i1 = floor(p1 * 3.0);
          var f1 = fract(p1 * 3.0);
          var u1 = f1 * f1 * f1 * (f1 * (f1 * 6.0 - 15.0) + 10.0);  // Quintic interpolation
          var a1 = hash21(i1);
          var b1 = hash21(i1 + vec2f(1.0, 0.0));
          var c1 = hash21(i1 + vec2f(0.0, 1.0));
          var d1 = hash21(i1 + vec2f(1.0, 1.0));
          cloud1 = cloud1 + mix(mix(a1, b1, u1.x), mix(c1, d1, u1.x), u1.y) * amp1;
          amp1 = amp1 * 0.5;
          p1 = p1 * 2.0 + vec2f(0.3, 0.7);
          
          // Octave 2
          i1 = floor(p1 * 3.0);
          f1 = fract(p1 * 3.0);
          u1 = f1 * f1 * f1 * (f1 * (f1 * 6.0 - 15.0) + 10.0);
          a1 = hash21(i1);
          b1 = hash21(i1 + vec2f(1.0, 0.0));
          c1 = hash21(i1 + vec2f(0.0, 1.0));
          d1 = hash21(i1 + vec2f(1.0, 1.0));
          cloud1 = cloud1 + mix(mix(a1, b1, u1.x), mix(c1, d1, u1.x), u1.y) * amp1;
          amp1 = amp1 * 0.5;
          p1 = p1 * 2.0 + vec2f(-0.2, 0.4);
          
          // Octave 3
          i1 = floor(p1 * 3.0);
          f1 = fract(p1 * 3.0);
          u1 = f1 * f1 * f1 * (f1 * (f1 * 6.0 - 15.0) + 10.0);
          a1 = hash21(i1);
          b1 = hash21(i1 + vec2f(1.0, 0.0));
          c1 = hash21(i1 + vec2f(0.0, 1.0));
          d1 = hash21(i1 + vec2f(1.0, 1.0));
          cloud1 = cloud1 + mix(mix(a1, b1, u1.x), mix(c1, d1, u1.x), u1.y) * amp1;
          amp1 = amp1 * 0.5;
          p1 = p1 * 2.0 + vec2f(0.5, -0.3);
          
          // Octave 4
          i1 = floor(p1 * 3.0);
          f1 = fract(p1 * 3.0);
          u1 = f1 * f1 * f1 * (f1 * (f1 * 6.0 - 15.0) + 10.0);
          a1 = hash21(i1);
          b1 = hash21(i1 + vec2f(1.0, 0.0));
          c1 = hash21(i1 + vec2f(0.0, 1.0));
          d1 = hash21(i1 + vec2f(1.0, 1.0));
          cloud1 = cloud1 + mix(mix(a1, b1, u1.x), mix(c1, d1, u1.x), u1.y) * amp1;
          amp1 = amp1 * 0.5;
          p1 = p1 * 2.0 + vec2f(-0.4, 0.6);
          
          // Octave 5 (finest detail)
          i1 = floor(p1 * 3.0);
          f1 = fract(p1 * 3.0);
          u1 = f1 * f1 * f1 * (f1 * (f1 * 6.0 - 15.0) + 10.0);
          a1 = hash21(i1);
          b1 = hash21(i1 + vec2f(1.0, 0.0));
          c1 = hash21(i1 + vec2f(0.0, 1.0));
          d1 = hash21(i1 + vec2f(1.0, 1.0));
          cloud1 = cloud1 + mix(mix(a1, b1, u1.x), mix(c1, d1, u1.x), u1.y) * amp1;
          
          // Shape layer 1 - threshold controlled by coverage (lower = more clouds)
          let threshold1 = 0.25 + (1.0 - coverage) * 0.45;  // Range: 0.25 (full) to 0.70 (clear)
          let softness1 = 0.2;
          cloud1 = smoothstep(threshold1, threshold1 + softness1, cloud1);
          
          // === LAYER 2: Wispy/smaller clouds (higher, faster) ===
          let cloudUV2 = vec2f(
            rayDir.x * t2 * 2.5 + cloudTime * 1.2 + 100.0,
            rayDir.z * t2 * 2.5 - cloudTime * 0.4 + 50.0
          );
          
          var cloud2 = 0.0;
          var amp2 = 0.5;
          var p2 = cloudUV2;
          
          // 4 octaves for layer 2
          // Octave 1
          var i2 = floor(p2 * 4.0);
          var f2 = fract(p2 * 4.0);
          var u2 = f2 * f2 * f2 * (f2 * (f2 * 6.0 - 15.0) + 10.0);
          var a2 = hash21(i2 + vec2f(13.0, 7.0));
          var b2 = hash21(i2 + vec2f(14.0, 7.0));
          var c2 = hash21(i2 + vec2f(13.0, 8.0));
          var d2 = hash21(i2 + vec2f(14.0, 8.0));
          cloud2 = cloud2 + mix(mix(a2, b2, u2.x), mix(c2, d2, u2.x), u2.y) * amp2;
          amp2 = amp2 * 0.5;
          p2 = p2 * 2.0 + vec2f(0.8, -0.5);
          
          // Octave 2
          i2 = floor(p2 * 4.0);
          f2 = fract(p2 * 4.0);
          u2 = f2 * f2 * f2 * (f2 * (f2 * 6.0 - 15.0) + 10.0);
          a2 = hash21(i2 + vec2f(23.0, 17.0));
          b2 = hash21(i2 + vec2f(24.0, 17.0));
          c2 = hash21(i2 + vec2f(23.0, 18.0));
          d2 = hash21(i2 + vec2f(24.0, 18.0));
          cloud2 = cloud2 + mix(mix(a2, b2, u2.x), mix(c2, d2, u2.x), u2.y) * amp2;
          amp2 = amp2 * 0.5;
          p2 = p2 * 2.0 + vec2f(-0.6, 0.9);
          
          // Octave 3
          i2 = floor(p2 * 4.0);
          f2 = fract(p2 * 4.0);
          u2 = f2 * f2 * f2 * (f2 * (f2 * 6.0 - 15.0) + 10.0);
          a2 = hash21(i2 + vec2f(33.0, 27.0));
          b2 = hash21(i2 + vec2f(34.0, 27.0));
          c2 = hash21(i2 + vec2f(33.0, 28.0));
          d2 = hash21(i2 + vec2f(34.0, 28.0));
          cloud2 = cloud2 + mix(mix(a2, b2, u2.x), mix(c2, d2, u2.x), u2.y) * amp2;
          amp2 = amp2 * 0.5;
          p2 = p2 * 2.0 + vec2f(0.4, 0.3);
          
          // Octave 4
          i2 = floor(p2 * 4.0);
          f2 = fract(p2 * 4.0);
          u2 = f2 * f2 * f2 * (f2 * (f2 * 6.0 - 15.0) + 10.0);
          a2 = hash21(i2 + vec2f(43.0, 37.0));
          b2 = hash21(i2 + vec2f(44.0, 37.0));
          c2 = hash21(i2 + vec2f(43.0, 38.0));
          d2 = hash21(i2 + vec2f(44.0, 38.0));
          cloud2 = cloud2 + mix(mix(a2, b2, u2.x), mix(c2, d2, u2.x), u2.y) * amp2;
          
          // Shape layer 2 - threshold controlled by coverage
          let threshold2 = 0.35 + (1.0 - coverage) * 0.40;  // Range: 0.35 (full) to 0.75 (clear)
          let softness2 = 0.18;
          cloud2 = smoothstep(threshold2, threshold2 + softness2, cloud2);
          
          // === Combine layers ===
          // Layer 1 is denser, layer 2 adds detail
          var totalCloud = cloud1 * 0.7 + cloud2 * 0.4;
          totalCloud = min(1.0, totalCloud);  // Clamp
          
          // Height fade - extended to cover entire sky with soft fade at zenith
          // Fade in near horizon, fade out gradually towards zenith
          let heightFade = smoothstep(0.0, 0.08, horizon) * smoothstep(0.95, 0.5, horizon);
          totalCloud = totalCloud * heightFade;
          
          // === Internal brightness variation (inspired by reference shader) ===
          // Create additional noise layer for color/brightness variation within clouds
          // This makes clouds look more volumetric with lighter and darker patches
          let varTime = cloudTime * 2.0;  // Faster variation movement
          let varUV = vec2f(
            rayDir.x * t1 * 2.0 + varTime * 0.5 + 50.0,
            rayDir.z * t1 * 2.0 - varTime * 0.3 + 30.0
          );
          
          // 3-octave FBM for internal variation
          var brightVar = 0.0;
          var varAmp = 0.4;
          var varP = varUV;
          
          // Octave 1
          var varI = floor(varP * 5.0);
          var varF = fract(varP * 5.0);
          var varU = varF * varF * varF * (varF * (varF * 6.0 - 15.0) + 10.0);
          var varA = hash21(varI + vec2f(77.0, 33.0));
          var varB = hash21(varI + vec2f(78.0, 33.0));
          var varC = hash21(varI + vec2f(77.0, 34.0));
          var varD = hash21(varI + vec2f(78.0, 34.0));
          brightVar = brightVar + mix(mix(varA, varB, varU.x), mix(varC, varD, varU.x), varU.y) * varAmp;
          varAmp = varAmp * 0.5;
          varP = varP * 2.0 + vec2f(0.7, -0.4);
          
          // Octave 2
          varI = floor(varP * 5.0);
          varF = fract(varP * 5.0);
          varU = varF * varF * varF * (varF * (varF * 6.0 - 15.0) + 10.0);
          varA = hash21(varI + vec2f(87.0, 43.0));
          varB = hash21(varI + vec2f(88.0, 43.0));
          varC = hash21(varI + vec2f(87.0, 44.0));
          varD = hash21(varI + vec2f(88.0, 44.0));
          brightVar = brightVar + mix(mix(varA, varB, varU.x), mix(varC, varD, varU.x), varU.y) * varAmp;
          varAmp = varAmp * 0.5;
          varP = varP * 2.0 + vec2f(-0.5, 0.6);
          
          // Octave 3
          varI = floor(varP * 5.0);
          varF = fract(varP * 5.0);
          varU = varF * varF * varF * (varF * (varF * 6.0 - 15.0) + 10.0);
          varA = hash21(varI + vec2f(97.0, 53.0));
          varB = hash21(varI + vec2f(98.0, 53.0));
          varC = hash21(varI + vec2f(97.0, 54.0));
          varD = hash21(varI + vec2f(98.0, 54.0));
          brightVar = brightVar + mix(mix(varA, varB, varU.x), mix(varC, varD, varU.x), varU.y) * varAmp;
          
          // Normalize to -0.5 to 0.5 range for brightness variation
          brightVar = (brightVar - 0.3) * 1.2;  // Center and scale
          
          // === Cloud colors ===
          // Day colors - now with brightness variation and blue-gray tones
          let cloudWhite = vec3f(0.98, 0.99, 1.0);  // Slightly blue-white
          let cloudGray = vec3f(0.65, 0.70, 0.80);  // Blue-gray mid tones
          let cloudDark = vec3f(0.45, 0.50, 0.60);  // Blue-gray darker patches
          
          // Night colors - darker, bluish
          let cloudNightLit = vec3f(0.22, 0.26, 0.35);  // More blue
          let cloudNightDark = vec3f(0.06, 0.08, 0.14);
          let cloudNightDeep = vec3f(0.03, 0.04, 0.08);  // Very dark patches
          
          // Lighting based on sun/moon
          let sunLightAmount = max(0.0, sunDir.y);
          let moonLightAmount = max(0.0, moonDir.y) * nightFactor;
          
          // Day cloud color with sun lighting AND internal variation
          let baseDayBright = 0.4 + sunLightAmount * 0.6;
          let varDayBright = clamp(baseDayBright + brightVar * 0.4, 0.0, 1.0);
          var dayCloudColor = mix(cloudDark, cloudWhite, varDayBright);
          
          // Add subtle warm tint to brighter areas (sun-lit effect)
          let sunTint = vec3f(1.0, 0.98, 0.92);
          dayCloudColor = mix(dayCloudColor, dayCloudColor * sunTint, max(0.0, brightVar) * sunLightAmount);
          
          // Dawn/dusk warm tinting
          let warmTint = vec3f(1.0, 0.8, 0.6);
          dayCloudColor = mix(dayCloudColor, dayCloudColor * warmTint, (dawnFactor + duskFactor) * 0.5);
          
          // === BACKLIGHT EFFECT === 
          // When looking toward the sun THROUGH clouds, clouds illuminate from behind
          let cloudBacklightDot = max(0.0, sunDot);  // How much we're looking toward the sun
          let backlightProximity = pow(cloudBacklightDot, 3.0);  // Concentrated around sun direction
          let backlightStrength = backlightProximity * totalCloud * sunLightAmount;  // Only when sun is up and clouds present
          
          // Backlight colors - warm glow through clouds
          let backlightColorHigh = vec3f(1.0, 0.95, 0.85);   // Warm white when sun is high
          let backlightColorLow = vec3f(1.0, 0.7, 0.4);      // Warm orange/gold at horizon
          let sunHeightForBacklight = smoothstep(0.0, 0.5, sunDir.y);
          let backlightColor = mix(backlightColorLow, backlightColorHigh, sunHeightForBacklight);
          
          // Apply backlight - additive glow effect
          dayCloudColor = dayCloudColor + backlightColor * backlightStrength * 0.6;
          
          // Night cloud color with subtle moon lighting AND internal variation
          let baseNightBright = moonLightAmount * 0.6;
          let varNightBright = clamp(baseNightBright + brightVar * 0.25, 0.0, 1.0);
          let nightCloudColor = mix(cloudNightDeep, cloudNightLit, varNightBright);
          
          // Blend day/night cloud colors
          let dayAmount = dayFactor + dawnFactor * 0.7 + duskFactor * 0.7;
          var finalCloudColor = mix(nightCloudColor, dayCloudColor, dayAmount);
          
          // ============================================
          // DISTANT LIGHTNING FLASHES - Incandescent glow effect
          // Creates bright flashes with multi-layer glow in distant clouds
          // Plus lightning bolts falling toward the ocean
          // ============================================
          // Only during storm weather (when skyDarkening > 0.3)
          var lightningBoltColor = vec3f(0.0);
          
          if (camera.skyDarkening > 0.3) {
            // Generate 3 independent flash points at different times
            for (var flashIdx = 0u; flashIdx < 3u; flashIdx = flashIdx + 1u) {
              let flashSeed = f32(flashIdx) * 7.31;
              
              // Flash occurs every 5-12 seconds (more spaced out)
              let flashInterval = 5.0 + hash21(vec2f(flashSeed, 1.0)) * 7.0;
              let flashPhase = fract(camera.time / flashInterval + hash21(vec2f(flashSeed, 2.0)));
              
              // Which cycle are we in?
              let cycleNum = floor(camera.time / flashInterval + hash21(vec2f(flashSeed, 2.0)));
              
              // Flash pulse with quick attack and slightly slower decay
              let flashAttack = smoothstep(0.0, 0.015, flashPhase);
              let flashDecay = smoothstep(0.12, 0.03, flashPhase);
              let flashActive = flashAttack * flashDecay;
              
              // Secondary pulse for flickering effect (like real lightning)
              let flickerPhase = fract(camera.time / flashInterval + hash21(vec2f(flashSeed, 2.0)) + 0.08);
              let flickerPulse = smoothstep(0.0, 0.01, flickerPhase) * smoothstep(0.05, 0.02, flickerPhase) * 0.4;
              let totalFlash = flashActive + flickerPulse;
              
              if (totalFlash > 0.01) {
                // Random direction for this flash (already using cycleNum from above)
                let flashAngle = hash21(vec2f(flashSeed + cycleNum, 3.0)) * 6.28318;
                let flashHeight = 0.12 + hash21(vec2f(flashSeed + cycleNum, 4.0)) * 0.25;
                
                // Flash direction in sky (horizon)
                let flashDir = normalize(vec3f(cos(flashAngle), flashHeight, sin(flashAngle)));
                
                // How close is this cloud to the flash?
                let dotToFlash = dot(normalize(rayDir), flashDir);
                
                // === CLOUD GLOW (only where there are clouds) ===
                if (totalCloud > 0.1) {
                  // Layer 1: Core - Intense bright center (small radius)
                  let coreGlow = smoothstep(0.85, 0.98, dotToFlash);
                  let coreIntensity = pow(coreGlow, 2.0) * 2.5;
                  
                  // Layer 2: Inner glow - Hot white/yellow (medium radius)
                  let innerGlow = smoothstep(0.75, 0.92, dotToFlash);
                  let innerIntensity = pow(innerGlow, 1.5) * 1.5;
                  
                  // Layer 3: Outer glow - Softer spread (large radius)
                  let outerGlow = smoothstep(0.55, 0.85, dotToFlash);
                  let outerIntensity = outerGlow * 0.6;
                  
                  // Layer 4: Ambient scatter - Very soft wide glow
                  let ambientGlow = smoothstep(0.35, 0.7, dotToFlash);
                  let ambientIntensity = ambientGlow * 0.25;
                  
                  // Incandescent color gradient
                  let coreColor = vec3f(1.0, 1.0, 1.0);
                  let innerColor = vec3f(1.0, 0.95, 0.85);
                  let outerColor = vec3f(1.0, 0.88, 0.7);
                  let ambientColor = vec3f(0.9, 0.8, 0.65);
                  
                  let cloudInfluence = totalCloud * totalCloud;
                  
                  let totalGlowColor = 
                    coreColor * coreIntensity + 
                    innerColor * innerIntensity + 
                    outerColor * outerIntensity + 
                    ambientColor * ambientIntensity;
                  
                  let finalGlow = totalGlowColor * totalFlash * cloudInfluence;
                  
                  let bloomSpread = smoothstep(0.0, 0.3, totalCloud) * outerGlow * totalFlash * 0.15;
                  let bloomColor = vec3f(0.95, 0.9, 0.8) * bloomSpread;
                  
                  finalCloudColor = finalCloudColor + finalGlow + bloomColor;
                }
                
                // === LIGHTNING BOLT - Always render bolt with flash ===
                let rayHorizLen = length(vec2f(rayDir.x, rayDir.z));
                if (rayHorizLen > 0.05) {
                  let rayAngle = atan2(rayDir.z, rayDir.x);
                  let rayHeight = rayDir.y / rayHorizLen;
                  
                  let boltSeed = flashSeed + cycleNum * 13.7;
                  
                  // Check angle difference with proper wrap-around
                  let angleDiff = rayAngle - flashAngle;
                  let wrappedDiff = angleDiff - floor((angleDiff + 3.14159) / 6.28318) * 6.28318;
                  
                  // Only render bolt if angle is close (avoid opposite side artifacts)
                  if (abs(wrappedDiff) < 0.15) {
                    // Bolt vertical range
                    let boltStartY = flashHeight;
                    let boltEndY = -0.06;
                    
                    if (rayHeight < boltStartY && rayHeight > boltEndY) {
                      let boltProgress = (boltStartY - rayHeight) / (boltStartY - boltEndY);
                      
                      // Main bolt zigzag pattern (more complex)
                      let zigzagFreq = 7.0 + hash21(vec2f(boltSeed, 23.0)) * 5.0;
                      let zigzag1 = sin(boltProgress * zigzagFreq + boltSeed) * 0.025;
                      let zigzag2 = sin(boltProgress * zigzagFreq * 2.3 + boltSeed * 1.7) * 0.012;
                      let zigzag3 = sin(boltProgress * zigzagFreq * 4.7 + boltSeed * 2.3) * 0.005;
                      let totalZigzag = zigzag1 + zigzag2 + zigzag3;
                      
                      // Distance from main bolt center line
                      let boltCenterAngle = flashAngle + totalZigzag;
                      let distDiff = rayAngle - boltCenterAngle;
                      let distFromBolt = abs(distDiff - floor((distDiff + 3.14159) / 6.28318) * 6.28318);
                      
                      // Width tapers toward bottom
                      let boltWidth = 0.012 * (1.0 - boltProgress * 0.5);
                      
                      // Core (very bright, thin)
                      let core = smoothstep(boltWidth, boltWidth * 0.1, distFromBolt);
                      // Inner glow
                      let glow = smoothstep(boltWidth * 4.0, boltWidth * 0.3, distFromBolt);
                      // Outer halo
                      let halo = smoothstep(boltWidth * 10.0, boltWidth * 1.5, distFromBolt);
                      
                      let fade = 1.0 - boltProgress * 0.35;
                      
                      var thisBoltColor = (
                        vec3f(1.0, 1.0, 1.0) * core * 3.5 +
                        vec3f(0.85, 0.9, 1.0) * glow * 1.8 +
                        vec3f(0.6, 0.7, 0.95) * halo * 0.5
                      ) * totalFlash * fade;
                      
                      // === BRANCH BOLTS ===
                      let numBranches = 2u + u32(hash21(vec2f(boltSeed, 30.0)) * 3.0);
                      for (var branchIdx = 0u; branchIdx < numBranches; branchIdx = branchIdx + 1u) {
                        let branchSeed = boltSeed + f32(branchIdx) * 17.3;
                        let branchStart = 0.15 + hash21(vec2f(branchSeed, 10.0)) * 0.55;
                        
                        if (boltProgress > branchStart && boltProgress < branchStart + 0.28) {
                          let branchProgress = (boltProgress - branchStart) / 0.28;
                          
                          // Branch angle offset (left or right of main bolt)
                          let branchSide = select(-1.0, 1.0, hash21(vec2f(branchSeed, 11.0)) > 0.5);
                          let branchAngleOffset = branchSide * (0.02 + hash21(vec2f(branchSeed, 12.0)) * 0.08);
                          
                          // Branch zigzag
                          let branchZigzag = sin(branchProgress * 14.0 + branchSeed) * 0.018;
                          
                          // Branch grows outward as it descends
                          let branchAngle = boltCenterAngle + branchAngleOffset * (1.0 + branchProgress * 1.5) + branchZigzag;
                          let branchDistDiff = rayAngle - branchAngle;
                          let distFromBranch = abs(branchDistDiff - floor((branchDistDiff + 3.14159) / 6.28318) * 6.28318);
                          
                          // Branch is thinner than main bolt
                          let branchWidth = 0.007 * (1.0 - branchProgress * 0.7);
                          
                          let branchCore = smoothstep(branchWidth, branchWidth * 0.15, distFromBranch);
                          let branchGlow = smoothstep(branchWidth * 3.5, branchWidth * 0.4, distFromBranch);
                          let branchHalo = smoothstep(branchWidth * 7.0, branchWidth * 1.2, distFromBranch);
                          
                          let branchFade = (1.0 - branchProgress) * 0.75;
                          thisBoltColor = thisBoltColor + (
                            vec3f(1.0, 1.0, 1.0) * branchCore * 2.5 +
                            vec3f(0.8, 0.85, 1.0) * branchGlow * 1.2 +
                            vec3f(0.6, 0.7, 0.9) * branchHalo * 0.4
                          ) * totalFlash * branchFade;
                        }
                      }
                      
                      lightningBoltColor = lightningBoltColor + thisBoltColor;
                    }
                  }
                }
              }
            }
            
            // Allow slight HDR for glow effect
            if (totalCloud > 0.1) {
              finalCloudColor = min(finalCloudColor, vec3f(2.5));
            }
          }
          
          // === Cloud opacity ===
          // Clouds are slightly more transparent at night to show stars through
          let dayOpacity = 0.92;
          let nightOpacity = 0.75;  // Semi-transparent to show stars
          let cloudOpacity = totalCloud * mix(nightOpacity, dayOpacity, dayAmount);
          
          // Apply clouds to sky
          skyColor = mix(skyColor, finalCloudColor, cloudOpacity);
          
          // Add lightning bolts on top of everything (they're in front of clouds)
          skyColor = skyColor + lightningBoltColor;
          
          // Silver lining effect (day only) - enhanced with variation
          if (dayAmount > 0.3) {
            let edge = smoothstep(0.2, 0.5, totalCloud) * (1.0 - smoothstep(0.5, 0.8, totalCloud));
            let edgeBright = 1.0 + max(0.0, brightVar) * 0.5;  // Brighter edges where variation is high
            skyColor = skyColor + vec3f(0.12, 0.12, 0.1) * edge * sunLightAmount * dayAmount * edgeBright;
          }
        }
        
        // ============================================
        // WEATHER EFFECTS - Sky darkening for storms
        // ============================================
        // Storm darkening - darkens and desaturates the existing clouds
        // PRESERVES the cloud texture and shape, intensity depends on key (3, 4, 5)
        // RESPECTS day/night cycle - doesn't turn night sky gray
        if (camera.skyDarkening > 0.01) {
          // Calculate how much "day" we have (0 = night, 1 = full day)
          // This prevents turning night sky gray
          let currentBrightness = (skyColor.r + skyColor.g + skyColor.b) / 3.0;
          let isDaytime = smoothstep(0.05, 0.25, currentBrightness);
          
          // Only apply gray effect during daytime, scale by how bright the sky is
          let effectStrength = camera.skyDarkening * isDaytime;
          
          if (effectStrength > 0.01) {
            // Step 1: Calculate luminance for reference
            let luminance = dot(skyColor, vec3f(0.299, 0.587, 0.114));
            
            // Step 2: Darken proportionally first
            let darkenFactor = 1.0 - effectStrength * 0.40;
            skyColor = skyColor * darkenFactor;
            
            // Step 3: Desaturate PARTIALLY - keep some color
            let desatAmount = min(effectStrength * 0.7, 0.6);  // Max 60% desaturation
            skyColor = mix(skyColor, vec3f(luminance * darkenFactor), desatAmount);
            
            // Step 4: STRONG push towards blue-gray storm tones
            // Real storm clouds have a distinctive blue-gray, steel-blue tint
            let stormBlueGray = vec3f(0.35, 0.42, 0.55);   // Steel blue-gray
            let stormDarkBlue = vec3f(0.25, 0.32, 0.45);   // Darker steel blue
            let stormTarget = mix(stormBlueGray, stormDarkBlue, effectStrength);
            
            // Apply blue-gray tint strongly based on luminance
            let blueTintStrength = effectStrength * 0.65;  // Strong blue tinting
            let tintedStorm = stormTarget * (luminance * 0.8 + 0.4);
            skyColor = mix(skyColor, tintedStorm, blueTintStrength);
            
            // Step 5: Slight contrast reduction
            let avgBrightness = (skyColor.r + skyColor.g + skyColor.b) / 3.0;
            skyColor = mix(skyColor, vec3f(avgBrightness * 0.95, avgBrightness, avgBrightness * 1.08), effectStrength * 0.12);
          }
          
          // At night with storm: just darken the clouds slightly, don't make gray
          if (isDaytime < 0.5 && camera.skyDarkening > 0.1) {
            // Night storm - make clouds darker and more ominous
            let nightDarken = camera.skyDarkening * (1.0 - isDaytime) * 0.3;
            skyColor = skyColor * (1.0 - nightDarken);
          }
        }
        
        return vec4f(skyColor, 1.0);
      }
    `
