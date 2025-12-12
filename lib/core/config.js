/**
 * ========================================
 * World Configuration
 * ========================================
 * All world parameters in one place
 */

// Avatar URL from Ready Player Me
export const AVATAR_URL = 'https://models.readyplayer.me/669dacbe365f0adda51336c5.glb?lod=2&morphTargets=none&textureAtlas=1024&pose=A';

export const CONFIG = {
  // World
  world: {
    waterLevel: 8.0,
    terrainScale: 0.002,
    terrainHeight: 80.0,
    terrainOffset: -10.0,
  },

  // Geometry sizes
  geometry: {
    terrain: {
      size: 4000,
      segments: 256,
    },
    ocean: {
      size: 20000,
      segments: 128,
    },
  },

  // Texture URLs
  textures: {
    grass: './assets/textures/grass.ktx2',
    grassNormal: './assets/textures/grassn.png',
    sand: './assets/textures/sand.ktx2',
    rock: './assets/textures/rock.ktx2',
    rockNormal: './assets/textures/rockn.png',
    snow: './assets/textures/snow.ktx2',
    waterBump: './assets/textures/waterbump.png',
    // Texture loading options
    useImageGrass: true,
    useImageSand: true,
    useImageRock: true,
    useImageSnow: true,
  },

  // Animation URLs
  assets: {
    animations: './assets/character/all-anim2.glb',
  },

  // Day/Night Cycle
  dayNight: {
    cycleDuration: 120.0,  // Full day cycle in seconds (2 minutes for testing, use 600 for 10min)
    sunSize: 0.012,        // Sun angular size (smaller = smaller sun)
    moonSize: 0.008,       // Moon angular size
    starDensity: 0.0003,   // Star density
    starBrightness: 1.2,   // Star brightness
    starBlur: 3.0,         // Star blur amount (1.0 = sharp, 5.0 = very soft)
    // Sky colors for different times of day
    dayZenith: [0.2, 0.45, 0.95],      // Deep blue zenith during day
    dayHorizon: [0.7, 0.85, 1.0],      // Light blue horizon during day
    sunsetZenith: [0.3, 0.2, 0.5],     // Purple zenith at sunset
    sunsetHorizon: [1.0, 0.4, 0.1],    // Orange/red horizon at sunset
    nightZenith: [0.02, 0.02, 0.08],   // Dark blue night sky
    nightHorizon: [0.05, 0.05, 0.12],  // Slightly lighter night horizon
    dawnZenith: [0.3, 0.25, 0.4],      // Purple/pink dawn zenith
    dawnHorizon: [1.0, 0.6, 0.3],      // Orange/yellow dawn horizon
    // Sun colors
    sunColorDay: [1.0, 0.98, 0.9],     // Bright white/yellow
    sunColorSunset: [1.0, 0.5, 0.1],   // Deep orange
    sunColorDawn: [1.0, 0.7, 0.4],     // Warm yellow/orange
    // Moon color
    moonColor: [0.9, 0.92, 1.0],       // Slight blue tint
  },

  // Ocean appearance
  ocean: {
    // Colors (RGB 0-1) - Beautiful blue ocean water
    deepColor: [0.01, 0.08, 0.22],       // Rich deep blue
    shallowColor: [0.04, 0.22, 0.38],    // Nice ocean blue shallow
    underwaterTint: [0.02, 0.15, 0.30],  // Blue tint
    skyReflectionColor: [0.4, 0.6, 0.85],
    foamColor: [0.95, 0.98, 1.0],
    sunColor: [1.0, 0.95, 0.85],
    sssColor: [0.0, 0.12, 0.18],
    causticsColor: [0.08, 0.15, 0.12],

    // Depth settings - More visible blue color
    deepDepthThreshold: 35.0,      // Faster transition to deep color
    shallowDepthThreshold: 8.0,    // Narrower shallow zone
    veryShallowThreshold: 3.0,     // Very shallow water for extra opacity
    foamDepthMax: 4.0,             // Foam appears up to this depth

    // Transparency - Less transparent, more blue
    baseAlphaMin: 0.6,             // More opaque base
    baseAlphaMax: 0.85,            // Much more opaque at edges
    depthAlphaRange: 12.0,         // Faster opacity increase with depth
    shallowAlphaBoost: 0.2,        // More opacity boost in shallow
    foamAlphaBlend: 0.85,

    // Distortion / Refraction - minimal for clean water
    distortionStrength: 0.0,
    distortionScale: 0.01,
    distortionSpeed: 0.1,
    distortionWorldScale: 1.0,

    // Caustics - Reduced for cleaner look
    causticsScale: 0.08,
    causticsIntensity: 0.08,
    causticsSpeed: 0.3,

    // Fresnel
    fresnelF0: 0.02,
    fresnelPower: 5.0,
    skyReflectionStrength: 0.6,

    // Subsurface scattering
    sssStrength: 0.3,
    sssShallowBoost: 0.2,
    sssPower: 3.0,

    // Specular
    specPower: 256.0,
    specStrength: 1.5,
    sparklePower: 1024.0,
    sparkleStrength: 2.0,

    // Foam
    foamThreshold: 0.65,
    foamEdgeStart: 3.0,
    foamBandThreshold: 0.75,
    foamEdgeStrength: 0.9,
    foamBandStrength: 0.5,

    // Waves (Gerstner)
    waveSpeed: 0.4,
    waves: [
      { dir: [1.0, 0.0], steepness: 0.02, wavelength: 80.0 },
      { dir: [0.7, 0.7], steepness: 0.015, wavelength: 60.0 },
      { dir: [0.3, 1.0], steepness: 0.01, wavelength: 40.0 },
      { dir: [-0.5, 0.8], steepness: 0.008, wavelength: 30.0 },
    ],

    // Lighting - sunset position (lower sun = longer shadows)
    sunDirection: [0.7, 0.35, 0.4],
    ambientLight: 0.25,
    diffuseLight: 0.2,
    lightBoost: 0.55,
    foamLightBoost: 0.2,

    // Underwater tint blend
    underwaterTintStrength: 0.4,
  },

  // Character properties
  character: {
    height: 1.8,                // Avatar height in meters
    scale: 2.0,                 // Avatar render scale (1.0 = ~1.7m, 2.0 = ~3.4m)
    baseHeight: 1.7,            // Base model height (before scale)
    groundedThreshold: 0.1,     // Distance to consider grounded
    skinColor: [1.0, 1.0, 1.0],  // White = no tint, use texture as-is
    spawnPosition: { x: 0, y: 80, z: 0 },  // Default spawn position
  },

  // NPC Configuration
  npc: {
    count: 1500,                // Number of NPCs to spawn
    freezeRadius: 6,            // Distance at which NPCs stop moving
    wanderRadius: 50,           // Radius for random wandering
    minSeparation: 3,           // Minimum distance between NPCs
    baseSpeed: 8,               // Base walking speed
    runSpeed: 16,               // Running speed
  },

  // Character movement
  movement: {
    baseSpeed: 8.0,
    sprintMultiplier: 2.0,
    jumpVelocity: 18.0,
    gravity: 40.0,
    flyRiseSpeed: 8.0,          // Speed of rising when holding F
    flySlowSpeed: 20.0,         // Slow flying speed (F + WASD)
    flyFastSpeed: 50.0,         // Fast flying speed (F + WASD + Shift)
    flyMaxHeight: 400.0,        // Maximum flying height
    rotationSmoothing: 10.0,
  },

  // Swimming/Water physics
  swimming: {
    buoyancy: 15.0,              // Upward force in water (counteracts gravity)
    drag: 3.0,                   // Water resistance (slows movement)
    swimSpeed: 20.0,             // Base swimming speed (normal)
    swimSprintMultiplier: 2.5,   // Sprint multiplier while swimming (20 * 2.5 = 50)
    swimAccel: 15.0,             // Base swim acceleration
    swimSprintAccel: 25.0,       // Sprint swim acceleration
    sinkSpeed: 4.0,              // Speed of sinking when holding Shift
    riseSpeed: 5.0,              // Speed of rising when holding Space
    surfaceFloat: 0.5,           // Strength of floating at surface
    swimDepthThreshold: 2.5,     // Water depth (meters) required to start swimming
    idleSinkMultiplier: 0.3,     // Sink speed multiplier when idle
    activeVelocityDamping: 0.9,  // Velocity reduction when actively swimming
  },

  // Camera
  camera: {
    distance: 8.0,
    height: 3.5,
    minDistance: 2.0,        // Minimum zoom distance
    maxDistance: 30.0,       // Maximum zoom distance
    zoomSpeed: 0.5,          // Zoom speed with mouse wheel
    lookHeightNear: 1.6,     // Look at height when zoomed in (face level, 0-2)
    lookHeightFar: 0.5,      // Look at height when zoomed out (body center, 0-1)
    minPitch: -1.2,          // Minimum pitch (looking up)
    maxPitch: 0.8,           // Maximum pitch (looking down)
    defaultPitch: -0.25,     // Default camera pitch on start
    mouseSensitivity: 0.003,
  },

  // Shadows
  shadows: {
    mapSize: 2048,
    area: 80.0,       // Smaller area = more detail
    near: 1.0,
    far: 300.0,
    pcfRadius: 0.001,
    bias: 0.005,      // Larger bias for low sun angle
    minLight: 0.3,
  },

  // Audio
  audio: {
    walkRate: 0.6,
    runRate: 0.8,
    footstepsLandVolume: 0.2,
    footstepsWaterVolume: 0.3,
    jumpVolume: 0.7,
    flyVolume: 0.4,
    // Sound URLs
    sounds: {
      footstepsLand: 'https://raw.githubusercontent.com/estebanrfp/ovgrid-assets/master/sounds/running.mp3',
      footstepsWater: 'https://raw.githubusercontent.com/estebanrfp/ovgrid-assets/master/sounds/walking-in-water-trim.mp3',
      jump: 'https://raw.githubusercontent.com/estebanrfp/ovgrid-assets/master/sounds/jump.mp3',
      fly: 'https://raw.githubusercontent.com/estebanrfp/ovgrid-assets/master/sounds/wind.mp3',
      rain: 'https://raw.githubusercontent.com/estebanrfp/ovgrid-assets/main/sounds/rain.mp3',
      thunder: 'https://raw.githubusercontent.com/estebanrfp/ovgrid-assets/main/sounds/thunder.mp3',
    },
  },

  // Animation
  animation: {
    maxBones: 128,        // Maximum bones for skeletal animation
    idleWeight: 1.0,
    walkWeight: 1.0,
    runWeight: 1.0,
    transitionSpeed: 0.1,
  },

  // Underwater effect (when camera is below water)
  underwater: {
    // Fog/visibility
    fogColor: [0.01, 0.05, 0.12],       // Deep blue fog
    fogDensity: 0.4,                     // How quickly visibility fades
    fogStart: 2.0,                       // Distance where fog starts
    fogEnd: 40.0,                        // Distance where fog is complete

    // Tint overlay
    tintColor: [0.0, 0.1, 0.2],          // Blue tint added to scene
    tintStrength: 0.25,                  // How strong the tint is

    // God rays / light shafts - vertical rays from above
    godRaysColor: [0.4, 0.7, 1.0],       // Light ray color (bright cyan-white)
    godRaysIntensity: 0.6,               // Ray brightness
    godRaysSpeed: 0.2,                   // Animation speed (subtle sway)
    godRaysDensity: 4.0,                 // Number of ray columns
    godRaysLength: 1.2,                  // How far rays extend down

    // Caustics (light patterns on surfaces)
    causticsIntensity: 0.35,
    causticsScale: 0.15,
    causticsSpeed: 0.4,

    // Water surface from below
    surfaceColor: [0.3, 0.6, 0.9],       // Bright surface color
    surfaceWaveStrength: 0.8,            // Wave distortion
    surfaceFresnelPower: 2.0,            // Edge glow

    // Bubbles
    bubblesEnabled: true,
    bubblesCount: 15.0,
    bubblesSpeed: 0.8,
    bubblesSize: 0.012,
    bubblesColor: [0.8, 0.9, 1.0],

    // Depth darkening
    depthDarkenStart: 0.0,               // Depth where darkening starts
    depthDarkenEnd: 100.0,                // Depth where it's darkest
    depthDarkenStrength: 0.6,            // How dark it gets

    // Blur effect
    blurRadius: 4.0,                     // Blur radius in pixels (0 = no blur)
  },

  // God Rays (3D volumetric light shafts underwater)
  godRays: {
    numRays: 80,
    intensity: 1.3,
    rayWidth: 4.5,
    rayLength: 40.0,
    speed: 0.3,
  },

  // Bubbles (underwater particle effect)
  bubbles: {
    numBubbles: 200,
    minSize: 0.08,
    maxSize: 0.5,
    riseSpeed: 1.0,
    wobbleSpeed: 2.0,
    wobbleAmount: 0.8,
    spawnRadius: 60.0,
  },

  // Weather System
  weather: {
    // Weather states: 0=clear, 1=clouds, 2=clouds-, 3=light rain, 4=heavy rain, 5=thunderstorm, 6=snow
    transitionSpeed: 0.5,  // Speed of weather transitions
    cloudCoverageSpeed: 0.8,  // Cloud interpolation speed

    // Weather state presets (intensity, cloudCoverage, rainVolume)
    states: {
      clear: { intensity: 0.0, cloudCoverage: 0.2, rainVolume: 0.0 },
      lightRain: { intensity: 0.4, cloudCoverage: 0.7, rainVolume: 0.25 },
      heavyRain: { intensity: 0.8, cloudCoverage: 0.9, rainVolume: 0.5 },
      storm: { intensity: 1.0, cloudCoverage: 1.0, rainVolume: 0.6 },
      snow: { intensity: 1.0, cloudCoverage: 0.85, skyDarkening: 0.1 },
    },

    // Rain settings
    rain: {
      lightParticles: 8000,       // Particles for light rain (visible but sparse)
      heavyParticles: 25000,      // Particles for heavy rain
      stormParticles: 50000,      // Particles for thunderstorm
      speed: 12.0,                // Fall speed (slower = more visible individual drops)
      length: 0.5,                // Drop length (visible streaks)
      width: 0.025,               // Drop width
      windStrength: 0.8,          // Wind effect on rain (subtle)
      spawnRadius: 40.0,          // Spawn area around camera (smaller = denser)
      spawnHeight: 35.0,          // Height above camera to spawn
      color: [0.8, 0.85, 0.95],   // Rain color (bright blue-white)
      opacity: 0.7,               // Base opacity (very visible)
      baseVolume: 0.4,            // Base rain sound volume
    },

    // Sky darkening for rain/storm - progressive gray levels
    skyDarkening: {
      lightRain: 0.40,       // Light gray overcast (key 3) - noticeably gray
      heavyRain: 0.65,       // Medium gray clouds (key 4) - quite dark
      storm: 0.90,           // Dark storm clouds (key 5) - very dark
      cloudGray: [0.35, 0.35, 0.4],  // Gray cloud tint
    },

    // Lightning/Thunder - Realistic burst pattern
    lightning: {
      // Timing between lightning bursts
      minBurstInterval: 4.0,   // Min seconds between lightning bursts
      maxBurstInterval: 12.0,  // Max seconds between lightning bursts

      // Flash burst settings (multiple rapid flashes)
      minFlashesPerBurst: 2,   // Minimum flashes in a burst
      maxFlashesPerBurst: 5,   // Maximum flashes in a burst
      flashDuration: 0.08,     // Duration of single flash (very quick)
      flashGap: 0.06,          // Gap between flashes in a burst
      flashIntensity: 1.5,     // Brightness of flash (additive, illuminates clouds)

      // Sound settings
      thunderSoundCooldown: 3.0,  // Min seconds between thunder sounds
      thunderVolume: 0.6,         // Thunder sound volume
      thunderDelayMin: 300,       // Min delay (ms) before thunder sound
      thunderDelayRange: 2200,    // Random additional delay (ms)
      thunderVolumeMin: 0.25,     // Min random thunder volume
      thunderVolumeRange: 0.45,   // Random additional volume
      thunderChance: 0.40,        // Probability of thunder per lightning flash (0-1)

      // Visual settings
      color: [0.95, 0.95, 1.0],  // Lightning color (white with slight blue)
    },

    // Snow settings
    snow: {
      particles: 10000,       // Number of snowflakes
      speed: 2.5,             // Fall speed (slow)
      wobbleSpeed: 1.5,       // Side-to-side wobble speed
      wobbleAmount: 2.0,      // Wobble distance
      minSize: 0.05,          // Minimum snowflake size
      maxSize: 0.25,          // Maximum snowflake size
      spawnRadius: 80.0,      // Spawn area
      spawnHeight: 60.0,      // Height above camera
      color: [0.95, 0.97, 1.0],  // Snow color (pure white)
      opacity: 0.85,          // Snowflake opacity
      skyBrightness: 0.9,     // Overcast sky brightness
    },
  },
};

// Make config globally accessible for debugging/tweaking
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
