# Copilot Instructions - WebGPU Virtual World Engine

## ⚠️ Reglas de Interacción

1. **SIEMPRE preguntar antes de hacer cambios grandes** - Confirmar con el usuario.
2. **NO ejecutar el servidor** - El usuario lo hace manualmente.
3. **Ser conciso** - Respuestas cortas y directas.

---

## 📋 Descripción del Proyecto

**Mundo virtual 3D** construido con **WebGPU 100% nativo**. Terreno infinito procedural, cielo dinámico, océano, efectos climáticos (lluvia, nieve, relámpagos), avatar animado con sistema de huesos, y efectos underwater.

---

## 🏗️ Arquitectura del Proyecto

### Estructura de Carpetas

```
TypeGPU-Project-World/
├── index.html              # Aplicación principal (monolítico, en proceso de modularización)
├── lib/                    # ⭐ BIBLIOTECA MODULAR - USAR PARA CÓDIGO NUEVO
│   ├── index.js            # Punto de entrada principal - exporta todos los módulos
│   ├── core/               # Funcionalidad core del engine
│   │   ├── index.js        # Exports del core
│   │   ├── config.js       # CONFIG con todos los parámetros del mundo
│   │   ├── init-native.js  # Inicialización WebGPU nativa (adapter, device)
│   │   └── uniforms.js     # Helpers para uniform buffers (createCameraData, etc.)
│   ├── textures/           # Sistema de carga de texturas
│   │   ├── index.js        # API unificada (loadTexture)
│   │   ├── ktx2-loader.js  # KTX2 + Basis Universal compression
│   │   └── image-loader.js # Carga PNG/JPG/WebP
│   ├── shaders/            # Shaders WGSL (TODO: extraer de index.html)
│   ├── systems/            # Sistemas del mundo (TODO: extraer de index.html)
│   ├── physics/            # Sistema de física (TODO: extraer de index.html)
│   ├── input/              # Manejo de input (TODO: extraer de index.html)
│   └── avatar/             # Carga de avatares/GLB (TODO: extraer de index.html)
├── assets/                 # Assets del mundo (modelos, texturas, audio)
│   ├── character/          # Modelos GLB y archivos fuente
│   ├── sounds/             # Assets de audio
│   └── textures/           # Texturas (.ktx2, .png, .jpg)
├── public/                 # Assets estáticos
```

### ❌ NO USAR

- **`src/`** - Carpeta deprecada, será eliminada. NO crear archivos aquí.

---

## 🎯 Principios de Desarrollo

### Patrón de Módulos

Cada módulo exporta funciones que reciben dependencias como parámetros:

```javascript
// ✅ CORRECTO - device como parámetro
export async function loadTexture(device, url) { ... }
export function createPipeline(device, shaderModule, format) { ... }

// ❌ INCORRECTO - NO usar variables globales
export async function loadTexture(url) { 
  device.createTexture(...) // device desde scope global - MAL
}
```

### Stack Tecnológico

| Tecnología | Uso |
|------------|-----|
| WebGPU Nativo | 100% - Rendering, texturas, pipelines, buffers |
| WGSL | Shaders nativos |
| Vite + pnpm | Build system |
| ktx-parse | Carga de texturas KTX2 |

**NO usamos**: Three.js, Babylon.js, TypeGPU - es un engine custom desde cero con WebGPU puro.

---

## 📍 Dónde Añadir Código Nuevo

| Tipo de Feature | Ubicación |
|-----------------|-----------|
| Valores de configuración | `lib/core/config.js` |
| Inicialización GPU | `lib/core/init-native.js` |
| Uniform buffer helpers | `lib/core/uniforms.js` |
| Carga de texturas | `lib/textures/` |
| Shaders WGSL | `lib/shaders/*.wgsl` (crear si no existe) |
| Sistemas (sky, terrain, ocean) | `lib/systems/*.js` (crear si no existe) |
| Física/movimiento | `lib/physics/*.js` (crear si no existe) |
| Input teclado/mouse | `lib/input/*.js` (crear si no existe) |
| Avatar/personaje | `lib/avatar/*.js` (crear si no existe) |
| Utilidades | `lib/utils/*.js` (crear si no existe) |

---

## 📦 Patrón de Exports

Cada carpeta de módulo tiene un `index.js` que re-exporta:

```javascript
// lib/textures/index.js
export { loadKTX2Texture, isKTX2, initBasisTranscoder } from './ktx2-loader.js';
export { loadImageTexture } from './image-loader.js';
export async function loadTexture(device, url) { ... }
```

El `lib/index.js` principal exporta todo:

```javascript
export { CONFIG, AVATAR_URL, initGPU, createUniformBuffers, ... } from './core/index.js';
export { createCameraData, createTerrainData, createOceanData, ... } from './core/index.js';
export { loadTexture, createSampler, ... } from './textures/index.js';
```

---

## 🎮 Sistema de Uniform Buffers (WebGPU Nativo)

Los uniform buffers se crean y actualizan con helpers nativos en `lib/core/uniforms.js`:

```javascript
// Crear buffer
const cameraBuffer = device.createBuffer({
  size: CAMERA_BUFFER_SIZE,  // 112 bytes
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Actualizar buffer en render loop
device.queue.writeBuffer(cameraBuffer, 0, createCameraData({
  viewProjection: vpMatrix,  // Float32Array(16)
  position: { x, y, z },
  time: totalTime,
}));
```

### Helpers disponibles:
| Helper | Buffer Size | Uso |
|--------|-------------|-----|
| `createCameraData()` | 112 bytes | Cámara principal |
| `createTerrainData()` | 80 bytes | Terreno procedural |
| `createOceanData()` | 384 bytes | Océano con olas |
| `createCharacterData()` | 80 bytes | Avatar/personaje |
| `createLightData()` | 80 bytes | Luz direccional + sombras |
| `createUnderwaterData()` | 256 bytes | Efectos underwater |
| `createGodRaysData()` | 32 bytes | Rayos de luz |
| `createBubblesData()` | 32 bytes | Burbujas underwater |
| `createRainData()` | 64 bytes | Partículas de lluvia |
| `createSnowData()` | 48 bytes | Partículas de nieve |
| `createLightningData()` | 32 bytes | Relámpagos |

---

## 🔧 Configuración del Mundo

Todos los parámetros están en `lib/core/config.js`:

```javascript
export const CONFIG = {
  world: { ... },        // Dimensiones, chunk size
  dayNight: { ... },     // Ciclo día/noche
  ocean: { ... },        // Nivel de agua, olas
  movement: { ... },     // Velocidades walk/run/jump
  swimming: { ... },     // Mecánicas de natación
  camera: { ... },       // Configuración de cámara
  shadows: { ... },      // Calidad de sombras
  audio: { ... },        // Configuración de sonido
  animation: { ... },    // Velocidades de animación
  underwater: { ... },   // Efectos bajo el agua
  weather: { ... },      // Partículas lluvia/nieve
};
```

---

## 🖼️ Sistema de Texturas

### KTX2 con Basis Universal

- Formatos soportados: BC3, BC1, BC7, ASTC, ETC2
- 8x menos uso de VRAM
- Detección automática de formato

```javascript
// Uso simple - detecta formato automáticamente
const texture = await loadTexture(device, './assets/textures/grass.ktx2');
const texture = await loadTexture(device, './assets/textures/rock.png');
```

---

## 📝 Importar en index.html

```javascript
import { 
  CONFIG, 
  initGPU, 
  createUniformBuffers,
  loadTexture, 
  isKTX2,
  // ... otros exports
} from './lib/index.js';
```

---

## 🚧 Pendiente de Modularizar

Aún en `index.html`, a extraer gradualmente:

1. **Shaders** (~2000 líneas) → `lib/shaders/`
2. **Texturas procedurales** → `lib/textures/procedural.js`
3. **Sistema de terreno** → `lib/systems/terrain.js`
4. **Sistema de océano** → `lib/systems/ocean.js`
5. **Sistema de cielo** → `lib/systems/sky.js`
6. **Clima (lluvia/nieve)** → `lib/systems/weather.js`
7. **Controlador de personaje** → `lib/systems/character.js`
8. **Física** → `lib/physics/movement.js`
9. **Manejo de input** → `lib/input/controls.js`
10. **Cargador GLB** → `lib/avatar/glb-loader.js`

---

## 🚀 Comandos

```bash
pnpm install    # Instalar dependencias
pnpm dev        # Desarrollo
pnpm build      # Build producción
pnpm preview    # Preview del build
```

---

## 📚 Referencias

- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WGSL Specification](https://www.w3.org/TR/WGSL/)
- [WebGPU Fundamentals](https://webgpufundamentals.org/)
- [WebGPU Samples](https://webgpu.github.io/webgpu-samples/)
- [WGSL Specification](https://www.w3.org/TR/WGSL/)
