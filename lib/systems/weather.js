/**
 * Weather System - Rain, snow, lightning, and weather state management
 * Extracted from index.html
 */

import {
  CONFIG,
  rainShader,
  lightningShader,
  snowShader,
  RAIN_UNIFORMS_SIZE,
  LIGHTNING_UNIFORMS_SIZE,
  SNOW_UNIFORMS_SIZE,
} from '../index.js';

/**
 * Creates the weather system
 * @param {GPUDevice} device - WebGPU device
 * @param {GPUTextureFormat} format - Canvas texture format
 * @param {GPUBuffer} cameraBuffer - Camera uniform buffer
 * @returns {Object} Weather system with state and methods
 */
export function createWeatherSystem(device, format, cameraBuffer) {
  // Weather state: 0=clear, 1=clouds+, 2=clouds-, 3=light rain, 4=heavy rain, 5=thunderstorm, 6=snow
  let currentWeather = 0;
  let weatherIntensity = 0.0;
  let weatherIntensityTarget = 0.0;
  let skyDarkening = 0.0;
  let skyDarkeningTarget = 0.0;
  let lightningFlash = 0.0;
  let cloudCoverage = CONFIG.weather.cloudCoverage;
  let cloudCoverageTarget = CONFIG.weather.cloudCoverage;

  // Lightning position
  let lightningPosX = 0;
  let lightningPosY = 0.3;

  // Lightning bolt state
  let nextLightningTime = 0;
  let lightningActive = false;
  let lightningStartTime = 0;
  let lightningX = 0;
  let lightningZ = 0;
  let lightningSeed = 0;

  // Rain buffer
  const rainBuffer = device.createBuffer({
    size: RAIN_UNIFORMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Rain pipeline
  const rainModule = device.createShaderModule({ code: rainShader });
  const rainLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });
  const rainPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [rainLayout] }),
    vertex: { module: rainModule, entryPoint: 'vs', buffers: [] },
    fragment: {
      module: rainModule, entryPoint: 'fs',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
  });

  const rainBG = device.createBindGroup({
    layout: rainLayout,
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: rainBuffer } },
    ],
  });

  // Lightning buffer
  const lightningBuffer = device.createBuffer({
    size: LIGHTNING_UNIFORMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Lightning pipeline
  const lightningModule = device.createShaderModule({ code: lightningShader });
  const lightningLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });
  const lightningPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [lightningLayout] }),
    vertex: { module: lightningModule, entryPoint: 'vs', buffers: [] },
    fragment: {
      module: lightningModule, entryPoint: 'fs',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
  });

  const lightningBG = device.createBindGroup({
    layout: lightningLayout,
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: lightningBuffer } },
    ],
  });

  // Snow buffer
  const snowBuffer = device.createBuffer({
    size: SNOW_UNIFORMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Snow pipeline
  const snowModule = device.createShaderModule({ code: snowShader });
  const snowLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });
  const snowPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [snowLayout] }),
    vertex: { module: snowModule, entryPoint: 'vs', buffers: [] },
    fragment: {
      module: snowModule, entryPoint: 'fs',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
  });

  const snowBG = device.createBindGroup({
    layout: snowLayout,
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: snowBuffer } },
    ],
  });

  // Weather sounds
  const weatherSounds = {
    rain: new Audio(CONFIG.audio.sounds.rain),
    thunder: new Audio(CONFIG.audio.sounds.thunder),
  };
  weatherSounds.rain.loop = true;
  weatherSounds.rain.volume = CONFIG.weather.rain.baseVolume;
  weatherSounds.thunder.volume = CONFIG.weather.lightning.thunderVolume;

  let currentWeatherSound = null;

  /**
   * Set weather type
   * @param {number} weatherType - 0=clear, 3=light rain, 4=heavy rain, 5=storm, 6=snow
   */
  function setWeather(weatherType) {
    const wc = CONFIG.weather;

    // Stop current weather sound
    if (currentWeatherSound) {
      currentWeatherSound.pause();
      currentWeatherSound.currentTime = 0;
      currentWeatherSound = null;
    }

    currentWeather = weatherType;

    const ws = CONFIG.weather.states;
    switch (weatherType) {
      case 0: // Clear
        weatherIntensityTarget = ws.clear.intensity;
        skyDarkeningTarget = 0.0;
        cloudCoverageTarget = ws.clear.cloudCoverage;
        console.log('☀️ Weather: Clear');
        break;
      case 3: // Light Rain
        weatherIntensityTarget = ws.lightRain.intensity;
        skyDarkeningTarget = wc.skyDarkening.lightRain;
        cloudCoverageTarget = ws.lightRain.cloudCoverage;
        weatherSounds.rain.volume = ws.lightRain.rainVolume;
        currentWeatherSound = weatherSounds.rain;
        currentWeatherSound.play().catch(() => {});
        console.log('🌧️ Weather: Light Rain');
        break;
      case 4: // Heavy Rain
        weatherIntensityTarget = ws.heavyRain.intensity;
        skyDarkeningTarget = wc.skyDarkening.heavyRain;
        cloudCoverageTarget = ws.heavyRain.cloudCoverage;
        weatherSounds.rain.volume = ws.heavyRain.rainVolume;
        currentWeatherSound = weatherSounds.rain;
        currentWeatherSound.play().catch(() => {});
        console.log('🌧️ Weather: Heavy Rain');
        break;
      case 5: // Thunderstorm
        weatherIntensityTarget = ws.storm.intensity;
        skyDarkeningTarget = wc.skyDarkening.storm;
        cloudCoverageTarget = ws.storm.cloudCoverage;
        weatherSounds.rain.volume = ws.storm.rainVolume;
        currentWeatherSound = weatherSounds.rain;
        currentWeatherSound.play().catch(() => {});
        nextLightningTime = Infinity;
        lightningFlash = 0;
        lightningActive = false;
        console.log('⛈️ Weather: Thunderstorm');
        break;
      case 6: // Snow
        weatherIntensityTarget = ws.snow.intensity;
        skyDarkeningTarget = ws.snow.skyDarkening;
        cloudCoverageTarget = ws.snow.cloudCoverage;
        console.log('❄️ Weather: Snow');
        break;
    }
  }

  /**
   * Adjust cloud coverage
   * @param {number} direction - 1 to increase, -1 to decrease
   */
  function adjustCloudCoverage(direction) {
    cloudCoverageTarget = Math.max(0, Math.min(1, cloudCoverageTarget + direction * 0.1));
    console.log('☁️ Cloud coverage:', (cloudCoverageTarget * 100).toFixed(0) + '%');
  }

  /**
   * Update weather state
   * @param {number} dt - Delta time in seconds
   * @param {number} totalTime - Total elapsed time
   */
  function update(dt, totalTime) {
    const wc = CONFIG.weather;

    // Interpolate weather values
    weatherIntensity += (weatherIntensityTarget - weatherIntensity) * wc.transitionSpeed * dt;
    skyDarkening += (skyDarkeningTarget - skyDarkening) * wc.transitionSpeed * dt;
    cloudCoverage += (cloudCoverageTarget - cloudCoverage) * wc.transitionSpeed * dt;

    // Lightning flash decay
    if (lightningFlash > 0) {
      lightningFlash *= Math.pow(wc.lightning.flashDecay, dt * 60);
      if (lightningFlash < 0.01) lightningFlash = 0;
    }

    // Thunderstorm lightning logic
    if (currentWeather === 5) {
      const lc = wc.lightning;

      // Initialize first lightning time
      if (nextLightningTime === Infinity) {
        nextLightningTime = totalTime + lc.minInterval + Math.random() * (lc.maxInterval - lc.minInterval);
      }

      // Trigger new lightning
      if (totalTime >= nextLightningTime && !lightningActive) {
        lightningActive = true;
        lightningStartTime = totalTime;
        lightningX = (Math.random() - 0.5) * 2;
        lightningZ = (Math.random() - 0.5) * 2;
        lightningSeed = Math.random() * 1000;

        // Sky flash
        lightningFlash = lc.flashIntensity;
        lightningPosX = lightningX;
        lightningPosY = 0.3 + Math.random() * 0.3;

        // Thunder sound
        setTimeout(() => {
          weatherSounds.thunder.currentTime = 0;
          weatherSounds.thunder.play().catch(() => {});
        }, lc.thunderDelay * 1000);

        nextLightningTime = totalTime + lc.minInterval + Math.random() * (lc.maxInterval - lc.minInterval);
      }

      // End lightning bolt
      if (lightningActive && (totalTime - lightningStartTime) > lc.boltDuration) {
        lightningActive = false;
      }
    } else {
      lightningActive = false;
    }
  }

  return {
    // State getters
    get currentWeather() { return currentWeather; },
    get weatherIntensity() { return weatherIntensity; },
    get skyDarkening() { return skyDarkening; },
    get cloudCoverage() { return cloudCoverage; },
    get lightningFlash() { return lightningFlash; },
    get lightningPosX() { return lightningPosX; },
    get lightningPosY() { return lightningPosY; },
    get lightningActive() { return lightningActive; },
    get lightningStartTime() { return lightningStartTime; },
    get lightningX() { return lightningX; },
    get lightningZ() { return lightningZ; },
    get lightningSeed() { return lightningSeed; },

    // Pipelines
    rainPipeline,
    rainBG,
    rainBuffer,
    lightningPipeline,
    lightningBG,
    lightningBuffer,
    snowPipeline,
    snowBG,
    snowBuffer,

    // Methods
    setWeather,
    adjustCloudCoverage,
    update,
  };
}
