/**
 * @fileoverview Day/Night Lighting System
 * 
 * @description
 * Calculates dynamic light direction based on time of day,
 * simulating sun and moon positions for realistic lighting
 * and shadow casting in the day/night cycle.
 * 
 * @features
 * - Dynamic sun position based on time
 * - Moon lighting during night (opposite to sun)
 * - Smooth dawn/dusk transitions
 * - Variable light intensity (shadows softer at night)
 * - Day/night state detection
 * 
 * @module lib/lighting
 */

/**
 * Calculate dynamic light direction based on time
 * Sun during day, moon at night
 * 
 * @param {number} totalTime - Total elapsed time in seconds
 * @param {number} cycleDuration - Duration of a full day/night cycle in seconds
 * @returns {Object} Light information
 * @returns {number[]} returns.direction - Normalized light direction [x, y, z]
 * @returns {number} returns.intensity - Light intensity (0.4 at night, 1.0 at day)
 * @returns {boolean} returns.isNight - True if currently night time
 * @returns {number} returns.timeOfDay - Current time of day (0-1, where 0.5 = noon)
 * @returns {number} returns.sunHeight - Sun height above horizon (-1 to 1)
 */
export function getLightDirection(totalTime, cycleDuration = 120) {
  const timeOfDay = (totalTime / cycleDuration) % 1.0;
  const sunAngle = timeOfDay * Math.PI * 2;

  // Sun moves in an arc across the sky
  const sunHeight = Math.sin(sunAngle - Math.PI / 2);
  const sunX = Math.cos(sunAngle - Math.PI / 2);

  // Moon is opposite to sun
  const moonHeight = -sunHeight;
  const moonX = -sunX;

  // Determine if it's day or night based on sun position
  // Day: sun above horizon (sunHeight > 0), Night: sun below horizon
  const isNight = sunHeight < -0.1;
  const isDusk = sunHeight >= -0.1 && sunHeight < 0.1;

  let dir, intensity;

  if (isNight) {
    // Use moon direction at night
    dir = [moonX, Math.max(moonHeight, 0.1), -0.3];
    intensity = 0.4;  // Moon casts softer shadows
  } else if (isDusk) {
    // Transition: blend between sun and moon
    const t = (sunHeight + 0.1) / 0.2;  // 0 at night, 1 at day
    const blendX = sunX * t + moonX * (1 - t);
    const blendY = Math.max(sunHeight, 0.05) * t + Math.max(moonHeight, 0.1) * (1 - t);
    dir = [blendX, Math.max(blendY, 0.1), 0.3 * t - 0.3 * (1 - t)];
    intensity = 0.4 + 0.6 * t;
  } else {
    // Use sun direction during day
    dir = [sunX, Math.max(sunHeight, 0.05), 0.3];
    intensity = 1.0;
  }

  // Normalize direction
  const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
  
  return {
    direction: dir.map(v => v / len),
    intensity,
    isNight: isNight || (isDusk && sunHeight < 0),
    timeOfDay,
    sunHeight
  };
}

/**
 * Calculate day factor for effects that depend on daylight
 * Used for god rays, ambient lighting, etc.
 * 
 * @param {number} totalTime - Total elapsed time in seconds
 * @param {number} cycleDuration - Duration of a full day/night cycle
 * @returns {number} Day factor (0 at night, 1 during day)
 */
export function getDayFactor(totalTime, cycleDuration = 120) {
  const timeInCycle = (totalTime % cycleDuration) / cycleDuration;
  const sunAngle = timeInCycle * Math.PI * 2 - Math.PI / 2;
  const sunHeight = Math.sin(sunAngle);
  
  // dayFactor: 0 at night, 1 during day, smooth transition
  return Math.max(0, Math.min(1, (sunHeight + 0.1) / 0.4));
}

/**
 * Get formatted time string from total time
 * 
 * @param {number} totalTime - Total elapsed time in seconds
 * @param {number} cycleDuration - Duration of a full day/night cycle
 * @returns {string} Formatted time string (HH:MM)
 */
export function getFormattedTime(totalTime, cycleDuration = 120) {
  const timeOfDay = (totalTime / cycleDuration) % 1.0;
  const hoursFloat = timeOfDay * 24;
  const h = Math.floor(hoursFloat);
  const m = Math.floor((hoursFloat % 1) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Calculate shadow projection parameters for a directional light
 * 
 * @param {number[]} lightDir - Light direction vector
 * @param {Object} position - Character/focus position {x, y, z}
 * @param {Object} config - Shadow configuration
 * @param {number} config.area - Shadow projection area
 * @param {number} config.near - Near plane
 * @param {number} config.far - Far plane
 * @param {boolean} isNight - Whether it's night (longer shadow distance)
 * @returns {Object} Light position {x, y, z}
 */
export function calculateLightPosition(lightDir, position, config, isNight = false) {
  const lightDistance = isNight ? 180 : 150;
  
  return {
    x: position.x + lightDir[0] * lightDistance,
    y: position.y + lightDir[1] * lightDistance + 50,
    z: position.z + lightDir[2] * lightDistance
  };
}

/**
 * Create orthographic projection matrix for shadow mapping
 * 
 * @param {number} area - Shadow projection area (width and height)
 * @param {number} near - Near plane distance
 * @param {number} far - Far plane distance
 * @returns {Float32Array} 4x4 orthographic projection matrix
 */
export function createOrthographicProjection(area, near, far) {
  return new Float32Array([
    2 / area, 0, 0, 0,
    0, 2 / area, 0, 0,
    0, 0, -2 / (far - near), 0,
    0, 0, -(far + near) / (far - near), 1
  ]);
}

export default {
  getLightDirection,
  getDayFactor,
  getFormattedTime,
  calculateLightPosition,
  createOrthographicProjection
};
