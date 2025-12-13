/**
 * Day/Night System - Time of day cycle management
 * Handles sun position, lighting, and time controls
 */

import { CONFIG } from '../index.js';

/**
 * Creates the day/night cycle system
 * @returns {Object} Day/night system with state and methods
 */
export function createDayNightSystem() {
  const cycleDuration = CONFIG.dayNight.cycleDuration;
  
  // Load state from localStorage
  const savedAutoTime = localStorage.getItem('ovgrid-auto-time');
  const savedDayTime = localStorage.getItem('ovgrid-day-time');
  
  let isAutoTime = savedAutoTime !== null ? savedAutoTime === 'true' : true;
  let dayTime = savedDayTime !== null ? parseFloat(savedDayTime) : 0;

  // UI elements (set via init)
  let autoTimeCheckbox = null;
  let timeSlider = null;
  let timeDisplay = null;

  /**
   * Initialize UI controls
   * @param {Object} elements - DOM elements { checkbox, slider, display }
   */
  function initUI(elements) {
    autoTimeCheckbox = elements.checkbox;
    timeSlider = elements.slider;
    timeDisplay = elements.display;

    // Set initial UI state
    if (autoTimeCheckbox) {
      autoTimeCheckbox.checked = isAutoTime;
      
      autoTimeCheckbox.addEventListener('change', (e) => {
        isAutoTime = e.target.checked;
        localStorage.setItem('ovgrid-auto-time', isAutoTime);
      });
    }

    if (timeSlider) {
      // Restore slider position
      if (!isAutoTime) {
        const pct = (dayTime / cycleDuration) * 100;
        timeSlider.value = pct;
      }

      timeSlider.addEventListener('input', (e) => {
        if (!isAutoTime) {
          const pct = parseFloat(e.target.value);
          dayTime = (pct / 100) * cycleDuration;
          localStorage.setItem('ovgrid-day-time', dayTime);
        }
      });
    }
  }

  /**
   * Update time progression
   * @param {number} dt - Delta time in seconds
   * @returns {number} Current day time
   */
  function update(dt) {
    if (isAutoTime) {
      dayTime += dt;
      
      // Update slider to reflect current time
      if (timeSlider) {
        const cycleTime = dayTime % cycleDuration;
        const pct = (cycleTime / cycleDuration) * 100;
        timeSlider.value = pct;
      }
    }
    
    return dayTime;
  }

  /**
   * Get normalized time (0-1) within the cycle
   * @returns {number} Normalized time
   */
  function getNormalizedTime() {
    return (dayTime % cycleDuration) / cycleDuration;
  }

  /**
   * Get time as hours (0-24)
   * @returns {number} Time in hours
   */
  function getTimeOfDay() {
    const normalized = getNormalizedTime();
    return normalized * 24;
  }

  /**
   * Format time as HH:MM string
   * @returns {string} Formatted time
   */
  function getFormattedTime() {
    const hours = getTimeOfDay();
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /**
   * Set specific time of day
   * @param {number} hours - Time in hours (0-24)
   */
  function setTimeOfDay(hours) {
    const normalized = (hours % 24) / 24;
    dayTime = normalized * cycleDuration;
    localStorage.setItem('ovgrid-day-time', dayTime);
    
    if (timeSlider) {
      timeSlider.value = normalized * 100;
    }
  }

  /**
   * Toggle auto time progression
   * @param {boolean} auto - Whether time should auto-progress
   */
  function setAutoTime(auto) {
    isAutoTime = auto;
    localStorage.setItem('ovgrid-auto-time', isAutoTime);
    
    if (autoTimeCheckbox) {
      autoTimeCheckbox.checked = isAutoTime;
    }
  }

  /**
   * Check if it's daytime (sun is up)
   * @returns {boolean} True if daytime
   */
  function isDaytime() {
    const hours = getTimeOfDay();
    return hours >= 6 && hours < 18;
  }

  /**
   * Check if it's night
   * @returns {boolean} True if nighttime
   */
  function isNighttime() {
    const hours = getTimeOfDay();
    return hours < 6 || hours >= 18;
  }

  /**
   * Get dawn/dusk state
   * @returns {string} 'dawn', 'day', 'dusk', or 'night'
   */
  function getTimeState() {
    const hours = getTimeOfDay();
    if (hours >= 5 && hours < 7) return 'dawn';
    if (hours >= 7 && hours < 17) return 'day';
    if (hours >= 17 && hours < 19) return 'dusk';
    return 'night';
  }

  /**
   * Save current state to localStorage
   */
  function saveState() {
    localStorage.setItem('ovgrid-auto-time', isAutoTime);
    localStorage.setItem('ovgrid-day-time', dayTime);
  }

  return {
    // Update
    update,
    
    // Initialization
    initUI,
    
    // Time getters
    get dayTime() { return dayTime; },
    get isAutoTime() { return isAutoTime; },
    get cycleDuration() { return cycleDuration; },
    getNormalizedTime,
    getTimeOfDay,
    getFormattedTime,
    getTimeState,
    isDaytime,
    isNighttime,
    
    // Time setters
    setTimeOfDay,
    setAutoTime,
    
    // State management
    saveState,
  };
}
