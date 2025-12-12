# OVGrid WebGPU

High-fidelity virtual world prototype built directly on native WebGPU. The project renders an infinite procedural landscape, dynamic sky and weather, ocean simulation, and an animated Ready Player Me avatar without relying on high-level 3D engines.

## Features

- Native WebGPU renderer with modular pipeline exported from [lib/index.js](lib/index.js)
- Massive procedural terrain and ocean geometry generated via [lib/geometry.js](lib/geometry.js)
- Atmospheric sky, weather, and post-processing shaders defined under [lib/shaders](lib/shaders)
- Character loading, animation blending, and skinning utilities in [lib/avatar](lib/avatar)
- Rich configuration surface (day/night cycle, movement, water, weather) centralized in [lib/core/config.js](lib/core/config.js)
- Extensive texture system with KTX2/Basis support and procedural fallbacks in [lib/textures](lib/textures)

## Prerequisites

- Node.js 18+
- pnpm (recommended) or npm/bun
- Chromium-based browser with WebGPU enabled (Chrome 113+, Edge 113+)

## Getting Started

```bash
pnpm install
pnpm dev
```

Visit the URL printed by Vite (defaults to http://localhost:3000/). The build is production-ready with:

```bash
pnpm build
pnpm preview
```

## Controls

- **Movement**: WASD
- **Jump**: Space
- **Sprint**: Shift
- **Fly toggle**: F (look up/down to ascend/descend)
- **Weather presets**: 0 clear, 1–2 clouds, 3 light rain, 4 heavy rain, 5 storm, 6 snow
- **Camera**: Mouse drag; scroll wheel for zoom

## Project Layout

```
ovgrid-webgpu/
├── index.html              # Main application orchestrating GPU setup and render loop
├── lib/
│   ├── core/               # Configuration, WebGPU bootstrap, uniform writers
│   ├── shaders/            # WGSL shader modules (sky, terrain, ocean, effects)
│   ├── textures/           # Texture loaders (KTX2, image, procedural)
│   ├── avatar/             # GLB loader, animation system, retargeting helpers
│   ├── systems/            # Modular game systems
│   │   ├── weather.js      # Rain, snow, lightning pipelines and sounds
│   │   ├── input.js        # Keyboard, mouse, touch, camera orbit control
│   │   └── sound.js        # Movement sounds (footsteps, jump, fly)
│   └── geometry.js         # Terrain/ocean mesh generation utilities
├── assets/                 # Textures, audio, character files (large binary data)
├── vite.config.ts          # Build setup (static copy of assets)
├── package.json            # Scripts and dependencies
└── README.md
```

## Configuration

Most gameplay, rendering, and audio tuning happens in [lib/core/config.js](lib/core/config.js). Adjust terrain sizes, water appearance, weather presets, movement speeds, and day/night timing in one place. Uniform buffer writers in [lib/core/uniforms.js](lib/core/uniforms.js) ensure data stays aligned with WGSL layouts.

## Shader Overview

- Sky and atmospheric scattering: [lib/shaders/sky.wgsl.js](lib/shaders/sky.wgsl.js)
- Terrain surface and height compute: [lib/shaders/terrain.wgsl.js](lib/shaders/terrain.wgsl.js) / [lib/shaders/compute.wgsl.js](lib/shaders/compute.wgsl.js)
- Ocean lighting and refraction: [lib/shaders/oceanShader.wgsl.js](lib/shaders/oceanShader.wgsl.js)
- Character, shadow, and weather effects: [lib/shaders](lib/shaders)

## Assets

The repository bundles high-resolution textures and long-form audio in [assets](assets). Large files can exceed GitHub’s 50 MB guidance; consider moving oversized media to Git Large File Storage if you fork or mirror the project.

## Troubleshooting

- **WebGPU not supported**: Ensure you are on an up-to-date Chromium browser with WebGPU enabled via chrome://flags (if necessary).
- **Slow loads**: The first run downloads Ready Player Me avatars and large textures; keep an eye on your network console.
- **Audio issues**: Browser autoplay policies may require a user gesture before sounds play.

## License

MIT. See package metadata for details.

## Author

**Esteban Fuster Pozzi** ([@estebanrfp](https://github.com/estebanrfp))
