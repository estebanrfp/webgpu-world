/**
 * Sound System - Movement sounds (footsteps, jump, fly)
 * Extracted from index.html
 */

import { CONFIG } from '../index.js';

/**
 * Creates the sound system for movement audio
 * @returns {Object} Sound system with methods
 */
export function createSoundSystem() {
  // Sound objects (URLs from CONFIG)
  const sounds = {
    footstepsLand: new Audio(CONFIG.audio.sounds.footstepsLand),
    footstepsWater: new Audio(CONFIG.audio.sounds.footstepsWater),
    jump: new Audio(CONFIG.audio.sounds.jump),
    fly: new Audio(CONFIG.audio.sounds.fly),
  };

  // Configure looping sounds
  sounds.footstepsLand.loop = true;
  sounds.footstepsWater.loop = true;
  sounds.fly.loop = true;

  // Set volumes from CONFIG
  sounds.footstepsLand.volume = CONFIG.audio.footstepsLandVolume;
  sounds.footstepsWater.volume = CONFIG.audio.footstepsWaterVolume;
  sounds.jump.volume = CONFIG.audio.jumpVolume;
  sounds.fly.volume = CONFIG.audio.flyVolume;

  // Playback rate configuration from CONFIG
  const soundConfig = {
    walkRate: CONFIG.audio.walkRate,
    runRate: CONFIG.audio.runRate,
  };

  // Track current movement state for sounds
  let currentSoundState = 'idle';
  let currentInWater = false;
  let currentFootstepsSound = null;

  /**
   * Update movement sounds based on state
   * @param {boolean} isMoving - Is the character moving
   * @param {boolean} isSprinting - Is the character sprinting
   * @param {boolean} isFlying - Is the character flying
   * @param {boolean} isJumping - Is the character jumping
   * @param {boolean} inWater - Is the character in water
   */
  function updateMovementSounds(isMoving, isSprinting, isFlying, isJumping, inWater) {
    let targetState = 'idle';

    if (isFlying) {
      targetState = 'fly';
    } else if (isJumping) {
      targetState = 'jump';
    } else if (isMoving) {
      targetState = isSprinting ? 'run' : 'walk';
    }

    // Determine which footsteps sound to use
    const targetFootsteps = inWater ? sounds.footstepsWater : sounds.footstepsLand;
    const targetRate = isSprinting ? soundConfig.runRate : soundConfig.walkRate;

    // Check if we need to switch footsteps sound (water vs land)
    const needsSoundSwitch = (targetState === 'walk' || targetState === 'run') &&
      (currentFootstepsSound !== targetFootsteps || currentSoundState === 'idle' || currentSoundState === 'fly' || currentSoundState === 'jump');

    // Update playback rate for current footsteps if just changing speed
    if ((targetState === 'walk' || targetState === 'run') && currentFootstepsSound === targetFootsteps && !needsSoundSwitch) {
      currentFootstepsSound.playbackRate = targetRate;
      currentSoundState = targetState;
      return;
    }

    // Only change if state changed or sound source changed
    if (targetState !== currentSoundState || needsSoundSwitch || inWater !== currentInWater) {
      // Stop previous sounds
      if (currentFootstepsSound) {
        currentFootstepsSound.pause();
        currentFootstepsSound.currentTime = 0;
      }
      if (currentSoundState === 'fly') {
        sounds.fly.pause();
        sounds.fly.currentTime = 0;
      }

      // Start new sound
      if (targetState === 'walk' || targetState === 'run') {
        currentFootstepsSound = targetFootsteps;
        currentFootstepsSound.playbackRate = targetRate;
        currentFootstepsSound.play().catch(() => { });
      } else if (targetState === 'fly') {
        sounds.fly.play().catch(() => { });
        currentFootstepsSound = null;
      } else if (targetState === 'jump') {
        sounds.jump.currentTime = 0;
        sounds.jump.play().catch(() => { });
      } else {
        currentFootstepsSound = null;
      }

      currentSoundState = targetState;
      currentInWater = inWater;
    }
  }

  /**
   * Stop all sounds
   */
  function stopAll() {
    if (currentFootstepsSound) {
      currentFootstepsSound.pause();
      currentFootstepsSound.currentTime = 0;
      currentFootstepsSound = null;
    }
    sounds.fly.pause();
    sounds.fly.currentTime = 0;
    currentSoundState = 'idle';
  }

  return {
    updateMovementSounds,
    stopAll,
    sounds,
    get currentSoundState() { return currentSoundState; },
  };
}
