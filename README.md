# WebGPU World — a native-WebGPU virtual world (proof of concept)

**The objective of this repository** is to answer one question: *can a complete, self-contained 3-D
virtual world — terrain, ocean, sky, weather, animated avatars, an NPC crowd and physics — be built
**directly on the native WebGPU API**, with hand-written WGSL and **no high-level 3-D engine** (no
Three.js, Babylon or Orillusion)?*

> Everything runs in the browser on WebGPU — no install, no account, no backend, no external services.

## Two worlds, two techniques

`webgpu-world` and [`orillusion-world`](https://github.com/estebanrfp/orillusion-world) are sibling
proofs of concept: the **same** idea — a browser-based 3-D virtual world with terrain/scene,
day-night, weather, ocean, animated avatars and NPCs — built **two different ways**, so the
approaches can be compared side by side.

- **[webgpu-world](https://github.com/estebanrfp/webgpu-world)** *(this repo)* — built directly on
  the **native WebGPU API**, hand-written WGSL, **no engine**.
- **[orillusion-world](https://github.com/estebanrfp/orillusion-world)** — the same kind of world
  built on the **[Orillusion](https://www.orillusion.com/)** WebGPU engine.

## What's in the world

- **Bounded procedural island** — a single island (highland + mountains, gentle beaches, open sea all
  around) generated from fractal noise. The player is kept near the origin so the world stays
  **finite and jitter-free without a Floating Origin system** — coordinates never get large enough to
  break Float32 precision.
- **Day/night + weather** — animated sky, three-layer clouds, rain / heavy rain / storm with
  lightning, snow, and ambient + footstep audio.
- **Ocean** — Gerstner waves, depth-based colour, caustics, foam, reflections, an underwater view, and
  an atmospheric horizon fade so the sea meets the sky cleanly.
- **Voxel avatars, built at runtime** — blocky characters meshed in JS from a compact parameter set
  and rigged to a Mixamo skeleton. **No external avatar service** (replaces the retired Ready Player
  Me dependency); every NPC is a deterministic, unique character.
- **Animation** — Mixamo clips (idle / walk / run / jump / fall) with crossfade blending, plus
  **swim / tread-water** for the sea and **floating** for flight.
- **NPC crowd** — dozens of avatars wander the island and **float/swim** when they reach deep water
  (they no longer fly).
- **Player traversal** — walk / run / sprint, jump, **fly (Q)**, and **swim**: you float when the
  water reaches your waist and swim when you move or dive.
- **GPU terrain physics** — the avatar walks *exactly* on the rendered ground (the visible mesh, the
  walkable ground and the water depth all share one height function).

## Getting started

```bash
pnpm install
pnpm dev
```

Open the URL Vite prints (defaults to http://localhost:3000/). Production build:

```bash
pnpm build
pnpm preview
```

## Controls

- **Move**: WASD · **Jump**: Space · **Sprint**: Shift
- **Fly**: **Q** (look up / down to ascend / descend)
- **Swim**: walk into the sea — you float when it reaches your waist and swim with WASD (S to dive)
- **Weather**: `0` clear · `1`–`2` clouds · `3` rain · `4` heavy · `5` storm · `6` snow
- **Camera**: mouse drag to orbit, scroll wheel to zoom

## How it works (notable techniques)

- **Finite world, no Floating Origin** — rather than a camera-relative coordinate system, the player
  is clamped to a small region around the island, so positions stay small and precise. The terrain
  mesh follows the camera, but the island shape is fixed in world space.
- **One height function, five consumers** — the terrain vertex shader, the terrain shadow pass, the
  GPU physics compute, the CPU sampler (NPCs / camera) and the ocean's depth-foam logic all evaluate
  the **same** `getHeight`, so the rendered ground, the walkable ground and the water depth never
  disagree.
- **Voxel avatars without a service** — characters are built from ~20 parameters and rigged to the
  Mixamo skeleton, so identity is a handful of bytes and never depends on a third-party API.
- **Animation correctness** — keyframe `alpha` is clamped to `[0,1]` so Mixamo clips that start at
  frame 1 don't extrapolate (and pop) for a few frames after each loop.

## Project layout

```
webgpu-world/
├── index.html              # Main app: GPU setup, pipelines, render loop
├── lib/
│   ├── core/               # config.js (all tuning), WebGPU bootstrap, uniform writers
│   ├── shaders/            # WGSL modules (sky, terrain, ocean, character, shadow, weather)
│   ├── textures/           # Texture loaders (KTX2/Basis, image, procedural)
│   ├── avatar/             # GLB loader, voxel-builder, animation system + retargeting
│   ├── systems/            # character, npc, movement, weather, input, sound, daynight, nameplate
│   ├── geometry.js         # Plane / mesh generation
│   └── math.js             # Matrices, vectors, CPU terrain height (= the shader's getHeight)
├── assets/                 # Textures, audio, character GLBs (rig + animations)
└── package.json
```

## Configuration

Almost all tuning lives in [`lib/core/config.js`](lib/core/config.js): island size & height, water
appearance, weather presets, movement and swimming, day/night timing, avatar look, audio. The island
shape itself is the `getHeight` function, duplicated **identically** across `terrain.wgsl.js`,
`shadow.wgsl.js`, `oceanShader.wgsl.js` and `math.js` — change all four together.

## Requirements

- A Chromium-based browser with **WebGPU** (Chrome / Edge 113+).
- Node.js 18+ and pnpm (or npm / bun).

## Troubleshooting

- **WebGPU not supported** — update Chrome/Edge, or enable WebGPU in `chrome://flags` if needed.
- **Slow first load** — the first run downloads the bundled textures and audio (avatars are built in
  the browser — no model downloads).
- **No audio** — browser autoplay policies may require a click/keypress before sounds start.

## License

MIT — see [LICENSE](LICENSE).

## Author

Esteban Fuster Pozzi ([@estebanrfp](https://github.com/estebanrfp)) — Full Stack JavaScript Developer
