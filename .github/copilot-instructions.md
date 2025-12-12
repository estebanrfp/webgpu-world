# Copilot Instructions - WebGPU Virtual World Engine

## ⚠️ Interaction Rules

1. **ALWAYS confirm before large refactors** - Ask the user first.
2. **Do NOT run the dev server** - The user handles runtime commands.
3. **Be concise** - Keep responses short and direct.

---

## 📋 Project Overview

**3D virtual world** built with **100% native WebGPU**. Infinite procedural terrain, dynamic sky, ocean simulation, weather effects (rain, snow, lightning), animated avatar with skeletal rig, and underwater rendering.

---

## 🏗️ Project Architecture

### Folder Structure

```
TypeGPU-Project-World/
├── index.html              # Main application (monolithic, being modularized)
├── lib/                    # ⭐ MODULAR LIBRARY - PLACE NEW CODE HERE
│   ├── index.js            # Main entry point exporting all modules
│   ├── core/               # Engine core functionality
│   │   ├── index.js        # Core exports
│   │   ├── config.js       # CONFIG with every world parameter
│   │   ├── init-native.js  # Native WebGPU init (adapter, device)
│   │   └── uniforms.js     # Uniform helpers (createCameraData, etc.)
│   ├── textures/           # Texture loading system
│   │   ├── index.js        # Unified API (loadTexture)
│   │   ├── ktx2-loader.js  # KTX2 + Basis Universal compression
│   │   └── image-loader.js # PNG/JPG/WebP loading
│   ├── shaders/            # WGSL shaders (TODO: extract from index.html)
│   ├── systems/            # World systems (TODO: extract from index.html)
│   ├── physics/            # Physics system (TODO: extract from index.html)
│   ├── input/              # Input handling (TODO: extract from index.html)
│   └── avatar/             # Avatar/GLB loading (TODO: extract from index.html)
├── assets/                 # World assets (models, textures, audio)
│   ├── character/          # GLB models and source assets
│   ├── sounds/             # Audio assets
│   └── textures/           # Textures (.ktx2, .png, .jpg)
├── public/                 # Static assets
```

### ❌ DO NOT USE

- **`src/`** - Deprecated folder, scheduled for removal. Do NOT create new files here.

---

## 🎯 Development Principles

### Module Pattern

Every module exports functions that receive dependencies explicitly:

```javascript
// ✅ CORRECT - device passed as argument
export async function loadTexture(device, url) { ... }
export function createPipeline(device, shaderModule, format) { ... }

// ❌ INCORRECT - NO implicit globals
export async function loadTexture(url) {
  device.createTexture(...) // Using a global device is WRONG
}
```

### Technology Stack

| Technology   | Purpose                                      |
|--------------|----------------------------------------------|
| Native WebGPU| Rendering, textures, pipelines, buffers      |
| WGSL         | Native shader language                       |
| Vite + pnpm  | Build tooling                                |
| ktx-parse    | KTX2 texture loading                         |

**NOT using**: Three.js, Babylon.js, TypeGPU – this is a custom engine built directly on WebGPU.

---

## 📍 Where to Add New Code

| Feature Type            | Location                      |
|-------------------------|-------------------------------|
| Configuration values    | `lib/core/config.js`          |
| GPU initialization      | `lib/core/init-native.js`     |
| Uniform buffer helpers  | `lib/core/uniforms.js`        |
| Texture loading         | `lib/textures/`               |
| WGSL shaders            | `lib/shaders/*.wgsl`          |
| Systems (sky, terrain…) | `lib/systems/*.js`            |
| Physics/movement        | `lib/physics/*.js`            |
| Input handling          | `lib/input/*.js`              |
| Avatar/character        | `lib/avatar/*.js`             |
| Utilities               | `lib/utils/*.js`              |

---

## 📦 Export Pattern

Each module folder exposes an `index.js` re-export:

```javascript
// lib/textures/index.js
export { loadKTX2Texture, isKTX2, initBasisTranscoder } from './ktx2-loader.js';
export { loadImageTexture } from './image-loader.js';
export async function loadTexture(device, url) { ... }
```

The main `lib/index.js` re-exports everything:

```javascript
export { CONFIG, AVATAR_URL, initGPU, createUniformBuffers, ... } from './core/index.js';
export { createCameraData, createTerrainData, createOceanData, ... } from './core/index.js';
export { loadTexture, createSampler, ... } from './textures/index.js';
```

---

## 🎮 Uniform Buffer System (Native WebGPU)

Uniform buffers are created and updated with helpers in `lib/core/uniforms.js`:

```javascript
// Create buffer
const cameraBuffer = device.createBuffer({
  size: CAMERA_BUFFER_SIZE,  // 112 bytes
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Update buffer inside the render loop
device.queue.writeBuffer(cameraBuffer, 0, createCameraData({
  viewProjection: vpMatrix,  // Float32Array(16)
  position: { x, y, z },
  time: totalTime,
}));
```

### Available Helpers
| Helper                 | Size (bytes) | Purpose                      |
|------------------------|--------------|------------------------------|
| `createCameraData()`   | 112          | Main camera uniforms         |
| `createTerrainData()`  | 80           | Procedural terrain           |
| `createOceanData()`    | 384          | Ocean shading + waves        |
| `createCharacterData()`| 80           | Avatar transform/color       |
| `createLightData()`    | 80           | Directional light + shadows  |
| `createUnderwaterData()`| 256         | Underwater post effects      |
| `createGodRaysData()`  | 32           | Light shafts                 |
| `createBubblesData()`  | 32           | Underwater bubbles           |
| `createRainData()`     | 64           | Rain particles               |
| `createSnowData()`     | 48           | Snow particles               |
| `createLightningData()`| 32           | Lightning flashes            |

---

## 🔧 World Configuration

All parameters live in `lib/core/config.js`:

```javascript
export const CONFIG = {
  world: { ... },        // Dimensions, chunk size
  dayNight: { ... },     // Day/night cycle options
  ocean: { ... },        // Water elevation, waves
  movement: { ... },     // Walk/run/jump speeds
  swimming: { ... },     // Swimming mechanics
  camera: { ... },       // Third-person camera tuning
  shadows: { ... },      // Shadow quality settings
  audio: { ... },        // Sound configuration
  animation: { ... },    // Animation blending
  underwater: { ... },   // Underwater visuals
  weather: { ... },      // Rain/snow/lighting presets
};
```

---

## 🖼️ Texture System

### KTX2 with Basis Universal

- Supported formats: BC3, BC1, BC7, ASTC, ETC2
- Up to 8× lower VRAM usage
- Automatic format detection

```javascript
// Simple usage – format detected automatically
const texture = await loadTexture(device, './assets/textures/grass.ktx2');
const texture = await loadTexture(device, './assets/textures/rock.png');
```

---

## 📝 Importing in index.html

```javascript
import {
  CONFIG,
  initGPU,
  createUniformBuffers,
  loadTexture,
  isKTX2,
  // ...more exports
} from './lib/index.js';
```

---

## 🚧 Pending Modularization

Still inside `index.html`, to be extracted gradually:

1. **Shaders** (~2000 lines) → `lib/shaders/`
2. **Procedural textures** → `lib/textures/procedural.js`
3. **Terrain system** → `lib/systems/terrain.js`
4. **Ocean system** → `lib/systems/ocean.js`
5. **Sky system** → `lib/systems/sky.js`
6. **Weather (rain/snow)** → `lib/systems/weather.js`
7. **Character controller** → `lib/systems/character.js`
8. **Physics** → `lib/physics/movement.js`
9. **Input handling** → `lib/input/controls.js`
10. **GLB loader** → `lib/avatar/glb-loader.js`

---

## 🚀 Commands

```bash
pnpm install    # Install dependencies
pnpm dev        # Start development server
pnpm build      # Production build
pnpm preview    # Preview production build
```

---

## 📚 References

- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WGSL Specification](https://www.w3.org/TR/WGSL/)
- [WebGPU Fundamentals](https://webgpufundamentals.org/)
- [WebGPU Samples](https://webgpu.github.io/webgpu-samples/)
- [WGSL Specification](https://www.w3.org/TR/WGSL/)
