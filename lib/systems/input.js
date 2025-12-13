/**
 * Input System - Keyboard, mouse, and touch input handling
 * Extracted from index.html - handles camera orbit and movement keys
 */

import { CONFIG } from '../index.js';

/**
 * Creates the input system for handling user input
 * @param {HTMLCanvasElement} canvas - The canvas element for mouse/touch events
 * @param {Object} callbacks - Optional callbacks for input events
 * @returns {Object} Input system with state and methods
 */
export function createInputSystem(canvas, callbacks = {}) {
  // Key state
  const keys = {};

  // Camera orbit state - load from localStorage or use defaults
  const savedCamera = localStorage.getItem('ovgrid_camera_state');
  const cameraState = savedCamera ? JSON.parse(savedCamera) : null;

  let camYaw = cameraState?.yaw ?? 0;
  let camPitch = cameraState?.pitch ?? CONFIG.camera.defaultPitch;
  let camDistance = cameraState?.distance ?? CONFIG.camera.distance;

  const camDistanceMin = CONFIG.camera.minDistance;
  const camDistanceMax = CONFIG.camera.maxDistance;
  const zoomSpeed = CONFIG.camera.zoomSpeed;
  const lookSpeed = CONFIG.camera.mouseSensitivity;

  // Mouse state
  let isDragging = false;

  // Touch state
  let lastTouchX = 0, lastTouchY = 0;
  let lastPinchDistance = 0;

  // Keyboard events
  function onKeyDown(e) {
    keys[e.code] = true;
    if (callbacks.onKeyDown) {
      callbacks.onKeyDown(e.code, keys);
    }
  }

  function onKeyUp(e) {
    keys[e.code] = false;
    if (callbacks.onKeyUp) {
      callbacks.onKeyUp(e.code, keys);
    }
  }

  // Mouse events
  function onMouseDown(e) {
    isDragging = true;
    canvas.style.cursor = 'grabbing';
  }

  function onMouseUp(e) {
    isDragging = false;
    canvas.style.cursor = 'grab';
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    camYaw -= e.movementX * lookSpeed;
    camPitch = Math.max(CONFIG.camera.minPitch, Math.min(CONFIG.camera.maxPitch, camPitch - e.movementY * lookSpeed));
  }

  function onWheel(e) {
    e.preventDefault();
    camDistance += e.deltaY * 0.01 * zoomSpeed;
    camDistance = Math.max(camDistanceMin, Math.min(camDistanceMax, camDistance));
  }

  // Touch events - single touch for rotation
  function onTouchStart(e) {
    if (e.touches.length === 1) {
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      isDragging = true;
    } else if (e.touches.length === 2) {
      // Pinch zoom - calculate initial distance
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 1 && isDragging) {
      const deltaX = e.touches[0].clientX - lastTouchX;
      const deltaY = e.touches[0].clientY - lastTouchY;
      camYaw -= deltaX * lookSpeed;
      camPitch = Math.max(CONFIG.camera.minPitch, Math.min(CONFIG.camera.maxPitch, camPitch - deltaY * lookSpeed));
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      e.preventDefault();
    } else if (e.touches.length === 2) {
      // Pinch to zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const pinchDistance = Math.sqrt(dx * dx + dy * dy);
      const delta = lastPinchDistance - pinchDistance;
      camDistance += delta * 0.02 * zoomSpeed;
      camDistance = Math.max(camDistanceMin, Math.min(camDistanceMax, camDistance));
      lastPinchDistance = pinchDistance;
      e.preventDefault();
    }
  }

  function onTouchEnd(e) {
    isDragging = false;
  }

  // Register event listeners
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);

  // Set initial cursor
  canvas.style.cursor = 'grab';

  /**
   * Save camera state to localStorage
   */
  function saveCameraState() {
    localStorage.setItem('ovgrid_camera_state', JSON.stringify({
      yaw: camYaw,
      pitch: camPitch,
      distance: camDistance
    }));
  }

  /**
   * Dispose of event listeners
   */
  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
  }

  return {
    // Key state
    keys,

    // Camera state getters/setters
    get camYaw() { return camYaw; },
    set camYaw(v) { camYaw = v; },
    get camPitch() { return camPitch; },
    set camPitch(v) { camPitch = v; },
    get camDistance() { return camDistance; },
    set camDistance(v) { camDistance = Math.max(camDistanceMin, Math.min(camDistanceMax, v)); },

    // Movement key helpers (WASD + Arrow keys)
    isKeyForward: () => keys['KeyW'] || keys['ArrowUp'],
    isKeyBackward: () => keys['KeyS'] || keys['ArrowDown'],
    isKeyLeft: () => keys['KeyA'] || keys['ArrowLeft'],
    isKeyRight: () => keys['KeyD'] || keys['ArrowRight'],
    isAnyMovementKey: () => keys['KeyW'] || keys['ArrowUp'] || keys['KeyS'] || keys['ArrowDown'] || 
                           keys['KeyA'] || keys['ArrowLeft'] || keys['KeyD'] || keys['ArrowRight'],

    // Methods
    saveCameraState,
    dispose,
  };
}
