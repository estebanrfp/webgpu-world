/**
 * Movement System - Character physics and movement
 * Handles walking, running, swimming, and flying
 */

import { CONFIG } from '../index.js';

/**
 * Creates the movement system for character physics
 * @param {Object} inputSystem - The input system for key states
 * @returns {Object} Movement system with state and methods
 */
export function createMovementSystem(inputSystem) {
  // Physics constants from config
  const gravity = -CONFIG.movement.gravity;
  const jumpForce = CONFIG.movement.jumpVelocity * 2;
  const baseSpeed = CONFIG.movement.baseSpeed;
  const sprintMultiplier = CONFIG.movement.sprintMultiplier;
  const flyRiseSpeed = CONFIG.movement.flyRiseSpeed;
  const flySlowSpeed = CONFIG.movement.flySlowSpeed;
  const flyFastSpeed = CONFIG.movement.flyFastSpeed;
  const flyMaxHeight = CONFIG.movement.flyMaxHeight;
  const rotationSmoothing = CONFIG.movement.rotationSmoothing;
  const waterLevel = CONFIG.world.waterLevel;
  const swimDepthThreshold = CONFIG.swimming.swimDepthThreshold;

  // Physics state
  let velocityY = 0;
  let swimVelX = 0, swimVelY = 0, swimVelZ = 0;
  let isGrounded = false;

  // Movement helpers from input system
  const { isKeyForward, isKeyBackward, isKeyLeft, isKeyRight, isAnyMovementKey, keys } = inputSystem;

  /**
   * Calculate camera-relative direction vectors
   * @param {number} camYaw - Camera yaw angle
   * @returns {Object} Forward and right direction vectors
   */
  function getCameraDirections(camYaw) {
    const fwdX = Math.sin(camYaw);
    const fwdZ = Math.cos(camYaw);
    const rightX = Math.cos(camYaw);
    const rightZ = -Math.sin(camYaw);
    return { fwdX, fwdZ, rightX, rightZ };
  }

  /**
   * Calculate 3D direction vector based on camera orientation
   * @param {number} camYaw - Camera yaw angle
   * @param {number} camPitch - Camera pitch angle
   * @returns {Object} 3D forward direction and horizontal components
   */
  function get3DDirection(camYaw, camPitch) {
    const cosPitch = Math.cos(camPitch);
    const sinPitch = Math.sin(camPitch);
    const fwdX = Math.sin(camYaw);
    const fwdZ = Math.cos(camYaw);
    
    return {
      fwd3dX: fwdX * cosPitch,
      fwd3dZ: fwdZ * cosPitch,
      fwd3dY: sinPitch,
      fwdX,
      fwdZ,
      rightX: Math.cos(camYaw),
      rightZ: -Math.sin(camYaw)
    };
  }

  /**
   * Update swimming movement
   * @param {Object} charPos - Character position {x, y, z}
   * @param {number} dt - Delta time
   * @param {number} camYaw - Camera yaw
   * @param {number} camPitch - Camera pitch
   * @param {number} terrainHeight - Ground height at position
   * @returns {Object} Movement vector and new target rotation
   */
  function updateSwimming(charPos, dt, camYaw, camPitch, terrainHeight) {
    const sw = CONFIG.swimming;
    const dir = get3DDirection(camYaw, camPitch);

    // Check if sprinting while swimming
    const isSprintSwimming = keys['ShiftLeft'] || keys['ShiftRight'];

    // Swimming acceleration - faster when sprinting
    const swimAccel = isSprintSwimming ? sw.swimSprintAccel : sw.swimAccel;
    const swimDrag = sw.drag;

    // Target swim speed
    const targetSwimSpeed = isSprintSwimming
      ? sw.swimSpeed * sw.swimSprintMultiplier
      : sw.swimSpeed;

    // W/Arrow = swim forward in camera direction (full 3D)
    if (isKeyForward()) {
      swimVelX += dir.fwd3dX * swimAccel * dt;
      swimVelZ += dir.fwd3dZ * swimAccel * dt;
      swimVelY += dir.fwd3dY * swimAccel * dt;
    }
    // S/Arrow = sink down
    if (isKeyBackward()) {
      swimVelY -= swimAccel * dt;
    }
    // A/D/Arrows = strafe left/right (horizontal only)
    if (isKeyLeft()) {
      swimVelX += dir.rightX * swimAccel * dt;
      swimVelZ += dir.rightZ * swimAccel * dt;
    }
    if (isKeyRight()) {
      swimVelX -= dir.rightX * swimAccel * dt;
      swimVelZ -= dir.rightZ * swimAccel * dt;
    }

    // Apply water drag (inertia)
    const dragFactor = Math.exp(-swimDrag * dt);
    swimVelX *= dragFactor;
    swimVelY *= dragFactor;
    swimVelZ *= dragFactor;

    // Clamp velocity to max swim speed
    const currentSpeed = Math.sqrt(swimVelX * swimVelX + swimVelY * swimVelY + swimVelZ * swimVelZ);
    if (currentSpeed > targetSwimSpeed) {
      const scale = targetSwimSpeed / currentSpeed;
      swimVelX *= scale;
      swimVelY *= scale;
      swimVelZ *= scale;
    }

    // Apply velocity to position
    charPos.x += swimVelX * dt;
    charPos.z += swimVelZ * dt;
    charPos.y += swimVelY * dt;

    // Calculate target rotation
    let charTargetRotation = null;
    if (Math.abs(swimVelX) > 0.1 || Math.abs(swimVelZ) > 0.1) {
      charTargetRotation = Math.atan2(swimVelX, swimVelZ);
    }

    // Clamp to water boundaries
    if (charPos.y > waterLevel) {
      charPos.y = waterLevel;
      swimVelY = 0;
    }
    if (charPos.y < terrainHeight) {
      charPos.y = terrainHeight;
      swimVelY = 0;
    }

    return {
      moveX: swimVelX,
      moveY: swimVelY,
      moveZ: swimVelZ,
      charTargetRotation,
      isSprintSwimming
    };
  }

  /**
   * Update flying movement
   * @param {Object} charPos - Character position {x, y, z}
   * @param {number} dt - Delta time
   * @param {number} camYaw - Camera yaw
   * @param {number} camPitch - Camera pitch
   * @param {number} terrainHeight - Ground height at position
   */
  function updateFlying(charPos, dt, camYaw, camPitch, terrainHeight) {
    const dir = get3DDirection(camYaw, camPitch);

    // Check if sprinting while flying
    const isSprintFlying = keys['ShiftLeft'] || keys['ShiftRight'];
    const currentFlySpeed = isSprintFlying ? flyFastSpeed : flySlowSpeed;

    // Apply movement based on camera direction
    if (isKeyForward()) {
      charPos.x += dir.fwd3dX * currentFlySpeed * dt;
      charPos.z += dir.fwd3dZ * currentFlySpeed * dt;
      charPos.y += dir.fwd3dY * currentFlySpeed * dt;
    }
    if (isKeyBackward()) {
      charPos.x -= dir.fwd3dX * currentFlySpeed * dt;
      charPos.z -= dir.fwd3dZ * currentFlySpeed * dt;
      charPos.y -= dir.fwd3dY * currentFlySpeed * dt;
    }
    // Strafe left/right (horizontal only)
    if (isKeyLeft()) {
      charPos.x += dir.rightX * currentFlySpeed * dt;
      charPos.z += dir.rightZ * currentFlySpeed * dt;
    }
    if (isKeyRight()) {
      charPos.x -= dir.rightX * currentFlySpeed * dt;
      charPos.z -= dir.rightZ * currentFlySpeed * dt;
    }

    // When no movement keys, slowly rise (default F behavior)
    if (!isAnyMovementKey()) {
      charPos.y += flyRiseSpeed * dt;
    }

    // Height limits
    if (charPos.y > flyMaxHeight) {
      charPos.y = flyMaxHeight;
    }

    velocityY = 0;

    // Auto-elevate when hitting terrain while flying
    const minFlyHeight = terrainHeight + 1.0;
    if (charPos.y < minFlyHeight) {
      charPos.y = minFlyHeight;
    }

    return { isSprintFlying };
  }

  /**
   * Update ground movement (walking/running)
   * @param {Object} charPos - Character position {x, y, z}
   * @param {number} dt - Delta time
   * @param {number} camYaw - Camera yaw
   * @param {number} speed - Current movement speed
   * @returns {Object} Movement vector and target rotation
   */
  function updateGroundMovement(charPos, dt, camYaw, speed) {
    // Reset swim velocity when not swimming
    swimVelX = 0;
    swimVelY = 0;
    swimVelZ = 0;

    const { fwdX, fwdZ, rightX, rightZ } = getCameraDirections(camYaw);

    let moveX = 0, moveZ = 0;

    if (isKeyForward()) { moveX += fwdX; moveZ += fwdZ; }
    if (isKeyBackward()) { moveX -= fwdX; moveZ -= fwdZ; }
    if (isKeyLeft()) { moveX += rightX; moveZ += rightZ; }
    if (isKeyRight()) { moveX -= rightX; moveZ -= rightZ; }

    // Normalize and apply movement
    const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
    let charTargetRotation = null;
    
    if (moveLen > 0.001) {
      moveX /= moveLen;
      moveZ /= moveLen;
      charPos.x += moveX * speed * dt;
      charPos.z += moveZ * speed * dt;
      charTargetRotation = Math.atan2(moveX, moveZ);
    }

    return { moveX, moveZ, moveY: 0, charTargetRotation };
  }

  /**
   * Update physics (gravity, jumping, ground collision)
   * @param {Object} charPos - Character position
   * @param {number} dt - Delta time
   * @param {number} terrainHeight - Ground height
   * @param {boolean} isDeepEnoughToSwim - Whether in deep water
   * @param {boolean} isFlying - Whether flying mode is active
   */
  function updatePhysics(charPos, dt, terrainHeight, isDeepEnoughToSwim, isFlying) {
    const groundLevel = terrainHeight;

    // Swimming physics when deep enough underwater
    if (isDeepEnoughToSwim && !isFlying) {
      const sw = CONFIG.swimming;

      // Cap falling speed in water
      if (velocityY < -sw.sinkSpeed) {
        velocityY = -sw.sinkSpeed;
      }

      // Apply water drag
      velocityY *= (1.0 - sw.drag * dt);

      // Passive physics when not actively moving: float so the WAIST sits at the surface (buoyancy),
      // instead of sinking to the bottom. Actively swimming (W to surface / S to dive) overrides this.
      if (!isAnyMovementKey()) {
        const floatLevel = waterLevel - swimDepthThreshold;  // waist ≈ threshold below the surface
        velocityY += (floatLevel - charPos.y) * 3.0 * dt;     // spring up to the waist-at-surface level
      } else {
        velocityY *= sw.activeVelocityDamping;
      }

      // Clamp velocity
      velocityY = Math.max(-sw.sinkSpeed, Math.min(sw.riseSpeed, velocityY));

      // Apply passive velocity
      charPos.y += velocityY * dt;

      // Ground collision underwater
      if (charPos.y < groundLevel) {
        charPos.y = groundLevel;
        velocityY = 0;
        isGrounded = true;
      }

      // Water surface collision
      if (charPos.y > waterLevel) {
        charPos.y = waterLevel;
        velocityY = 0;
      }
    }
    // Normal ground physics
    else if (!isFlying) {
      // Jump with Space
      if (keys['Space'] && isGrounded) {
        velocityY = jumpForce;
        isGrounded = false;
      }

      // Apply gravity
      velocityY += gravity * dt;
      charPos.y += velocityY * dt;

      // Ground collision
      if (charPos.y < groundLevel) {
        charPos.y = groundLevel;
        velocityY = 0;
        isGrounded = true;
      }
    }

    // Update grounded state
    isGrounded = charPos.y <= groundLevel + CONFIG.character.groundedThreshold;
  }

  /**
   * Smoothly interpolate rotation
   * @param {number} charRotation - Current rotation
   * @param {number} charTargetRotation - Target rotation
   * @param {number} dt - Delta time
   * @returns {number} New rotation value
   */
  function smoothRotation(charRotation, charTargetRotation, dt) {
    let rotationDiff = charTargetRotation - charRotation;
    // Handle wrap-around
    while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
    while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
    return charRotation + rotationDiff * Math.min(1, rotationSmoothing * dt);
  }

  /**
   * Calculate current movement speed based on state
   * @param {boolean} isFlying - Flying mode active
   * @param {boolean} isUnderwater - In water
   * @param {boolean} isSprinting - Sprint key held
   * @returns {number} Movement speed
   */
  function calculateSpeed(isFlying, isUnderwater, isSprinting) {
    if (isFlying) {
      return isSprinting ? flyFastSpeed : flySlowSpeed;
    } else if (isUnderwater) {
      const sw = CONFIG.swimming;
      return isSprinting ? sw.swimSpeed * sw.swimSprintMultiplier : sw.swimSpeed;
    } else if (isSprinting) {
      return baseSpeed * sprintMultiplier;
    }
    return baseSpeed;
  }

  /**
   * Check if the character is in swimmable water.
   *
   * Triggered by the DEPTH OF THE SEABED beneath the avatar (not the avatar's own depth): you swim
   * whenever your body is at/under the surface AND the ground below is deeper than the swim
   * threshold. This lets you swim through the whole water column over deep water — float at the
   * surface, dive with S, surface with W — with no dead-zone near the waterline. (The old test used
   * `charPos.y`, so you only swam once already >threshold under the surface, and never at the top.)
   * @param {Object} charPos - Character position
   * @param {number} terrainHeight - Ground (seabed) height under the avatar
   * @returns {boolean} Whether swimming is allowed
   */
  function canSwim(charPos, terrainHeight) {
    const atOrUnderSurface = charPos.y < waterLevel + 0.5;        // body touching the water (small bob margin)
    const overDeepWater = (waterLevel - terrainHeight) > swimDepthThreshold; // seabed is deep enough
    return atOrUnderSurface && overDeepWater;
  }

  /**
   * Reset physics state (useful when teleporting)
   */
  function resetPhysics() {
    velocityY = 0;
    swimVelX = 0;
    swimVelY = 0;
    swimVelZ = 0;
    isGrounded = false;
  }

  return {
    // Update methods
    updateSwimming,
    updateFlying,
    updateGroundMovement,
    updatePhysics,
    smoothRotation,
    
    // Utility methods
    getCameraDirections,
    get3DDirection,
    calculateSpeed,
    canSwim,
    resetPhysics,
    
    // State getters
    get velocityY() { return velocityY; },
    set velocityY(v) { velocityY = v; },
    get isGrounded() { return isGrounded; },
    set isGrounded(v) { isGrounded = v; },
    
    // Constants (for external reference)
    waterLevel,
    swimDepthThreshold,
    flyMaxHeight,
  };
}
