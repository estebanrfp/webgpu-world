/**
 * Voxel avatar builder — turns a compact parameter object into a skinned voxel
 * mesh rigged to the existing Mixamo skeleton, so it animates with the same
 * clips (Idle/Walk/Run/Jump/Floating) as the GLB avatar.
 *
 * Design: "Minecraft-classic" — one rigid box per limb (weight 1.0 to a single
 * bone). Boxes are anchored to the skeleton's BIND-POSE joint positions (derived
 * from the inverse bind matrices) so they line up with the bones and deform
 * correctly. The character faces +Z (Mixamo toe direction), so face features sit
 * on the +Z side of the head.
 *
 * Output matches the avatar vertex layout: interleaved 19 floats per vertex
 * (pos3 · normal3 · uv2 · joints4 · weights4 · color3), so CharacterSystem can
 * upload it verbatim. The trailing color3 carries per-box flat colors (voxel is
 * textureless). Shared by the in-engine runtime and the standalone editor preview.
 *
 * @module avatar/voxel-builder
 */

/** Default avatar parameters (the editor's exported JSON shape). */
export const DEFAULT_VOXEL_PARAMS = {
  skin: '#c98756', hairColor: '#3a2618', eyeColor: '#1f2937', mouthColor: '#be123c',
  shirtColor: '#2563eb', pantsColor: '#1e3a8a', shoeColor: '#111827',
  hair: 'short', beard: 'none', glasses: 'none', hat: 'none',
  nose: 'small', ears: 'human', pattern: 'none',
  articulated: true, height: 1, head: 1, width: 1,
};

// ── Coherent variety: curated palettes + part archetypes ─────────────────────
// Shared by the editor's "Random" button and the NPC roster so every generated
// avatar is harmonious (coordinated colors, sensible part combinations).
const SKIN = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#a0673a', '#8d5524', '#5c3836'];
const HAIR = ['#0b0b0d', '#2b1d12', '#3a2618', '#6b4423', '#a86b32', '#d6b370', '#b8b8c0', '#7c2d12', '#b83280', '#2b6cb0'];
const EYE = ['#3a2a1a', '#2563eb', '#2f855a', '#1a1a1a', '#92400e', '#0e7490'];
const MOUTH = ['#be123c', '#c2410c', '#9d174d', '#a83246'];
const OUTFITS = [
  { shirt: '#1f6feb', pants: '#1e3a8a', shoe: '#0f1f3d' }, { shirt: '#2f855a', pants: '#22543d', shoe: '#163a2a' },
  { shirt: '#c53030', pants: '#742a2a', shoe: '#3b1414' }, { shirt: '#b7791f', pants: '#5f4424', shoe: '#3b2a14' },
  { shirt: '#4a5568', pants: '#2d3748', shoe: '#1a202c' }, { shirt: '#6b46c1', pants: '#44337a', shoe: '#2a1f4d' },
  { shirt: '#2c7a7b', pants: '#234e52', shoe: '#14302f' }, { shirt: '#dd6b20', pants: '#9c4221', shoe: '#4d2410' },
  { shirt: '#d53f8c', pants: '#97266d', shoe: '#4a1339' }, { shirt: '#0bc5ea', pants: '#2c5282', shoe: '#1a365d' },
];
const ARCHETYPES = [
  { hair: ['short', 'flat', 'side'], beard: ['none', 'stubble'], glasses: ['none', 'classic'], hat: ['none', 'cap'], nose: ['small', 'long'], ears: ['human'], pattern: ['none', 'stripes'] },
  { hair: ['mohawk', 'spikes'], beard: ['none', 'goatee'], glasses: ['sun'], hat: ['none'], nose: ['small'], ears: ['human', 'elf'], pattern: ['none', 'diamond'] },
  { hair: ['short', 'flat'], beard: ['full', 'goatee', 'stubble'], glasses: ['none', 'sun'], hat: ['cap', 'beanie'], nose: ['small', 'long'], ears: ['human'], pattern: ['none'] },
  { hair: ['long', 'flat'], beard: ['full', 'none'], glasses: ['none'], hat: ['crown', 'tophat'], nose: ['small'], ears: ['human', 'elf'], pattern: ['gradient', 'none'] },
  { hair: ['short', 'flat'], beard: ['none', 'stubble'], glasses: ['sun', 'visor'], hat: ['none', 'helmet'], nose: ['small'], ears: ['human'], pattern: ['tech', 'grid'] },
];

/**
 * Generate a coherent random voxel avatar (harmonious palette + a part archetype).
 * @param {() => number} [rand] - RNG returning [0,1) (defaults to Math.random; pass
 *   a seeded RNG for deterministic NPCs).
 * @returns {object} voxel params
 */
export const randomVoxelParams = (rand = Math.random) => {
  const pick = (arr) => arr[(rand() * arr.length) | 0];
  const r2 = (v) => +v.toFixed(2);
  const a = pick(ARCHETYPES), o = pick(OUTFITS);
  return {
    skin: pick(SKIN), hairColor: pick(HAIR), eyeColor: pick(EYE), mouthColor: pick(MOUTH),
    shirtColor: o.shirt, pantsColor: o.pants, shoeColor: o.shoe,
    hair: pick(a.hair), beard: pick(a.beard), glasses: pick(a.glasses), hat: pick(a.hat),
    nose: pick(a.nose), ears: pick(a.ears), pattern: pick(a.pattern),
    articulated: true,
    height: r2(0.9 + rand() * 0.25), head: r2(0.92 + rand() * 0.16), width: r2(0.9 + rand() * 0.22),
  };
};

export const VOXEL_FLOATS_PER_VERTEX = 19; // pos3 + normal3 + uv2 + joints4 + weights4 + color3

// ── small math helpers ──────────────────────────────────────────────────────
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const mul = (a, s) => a.map((v) => v * s);

/** Translation (world position) of a 4×4's inverse — i.e. a joint's bind-pose origin. */
const inverseTranslation = (a) => {
  const inv0 = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  const inv4 = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  const inv8 = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  const inv12 = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  const inv13 = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  const inv14 = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  const det = a[0] * inv0 + a[1] * inv4 + a[2] * inv8 + a[3] * inv12;
  const d = det ? 1 / det : 0;
  return [inv12 * d, inv13 * d, inv14 * d];
};

/**
 * Resolve bind-pose joint positions + a name→index lookup from a skeleton.
 * @param {{joints:string[], inverseBindMatrices:Float32Array[]}} skeleton
 */
const resolveJoints = (skeleton) => {
  const strip = (s) => s.replace(/^mixamorig:/i, '').toLowerCase();
  const index = {};
  const pos = {};
  skeleton.joints.forEach((name, i) => {
    const key = strip(name);
    index[key] = i;
    pos[key] = inverseTranslation(skeleton.inverseBindMatrices[i]);
  });
  return { index, pos };
};

// ── box emitter ─────────────────────────────────────────────────────────────
// Unit cube corners and its 6 faces (each: 4 corner indices + outward normal).
const CORNERS = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const FACES = [
  { idx: [0, 3, 2, 1], n: [0, 0, -1] }, { idx: [4, 5, 6, 7], n: [0, 0, 1] },
  { idx: [0, 4, 7, 3], n: [-1, 0, 0] }, { idx: [1, 2, 6, 5], n: [1, 0, 0] },
  { idx: [3, 7, 6, 2], n: [0, 1, 0] }, { idx: [0, 1, 5, 4], n: [0, -1, 0] },
];

/**
 * Push one oriented box into the accumulator, rigidly bound to a single bone.
 * @param {object} out - accumulator { verts:number[], indices:number[], v:number }
 * @param {number[]} center - box center (bind space)
 * @param {number[]} half - half-extents along [u, v, axis]
 * @param {object} frame - { u, v, axis } orthonormal basis
 * @param {number[]} color - rgb
 * @param {number} bone - joint index to bind every vertex to
 */
const addBox = (out, center, half, frame, color, bone) => {
  const { u, v, axis } = frame;
  for (const f of FACES) {
    const nWorld = norm([
      f.n[0] * u[0] + f.n[1] * v[0] + f.n[2] * axis[0],
      f.n[0] * u[1] + f.n[1] * v[1] + f.n[2] * axis[1],
      f.n[0] * u[2] + f.n[1] * v[2] + f.n[2] * axis[2],
    ]);
    const base = out.v;
    for (const ci of f.idx) {
      const c = CORNERS[ci];
      const off = [
        c[0] * half[0] * u[0] + c[1] * half[1] * v[0] + c[2] * half[2] * axis[0],
        c[0] * half[0] * u[1] + c[1] * half[1] * v[1] + c[2] * half[2] * axis[1],
        c[0] * half[0] * u[2] + c[1] * half[1] * v[2] + c[2] * half[2] * axis[2],
      ];
      out.verts.push(
        center[0] + off[0], center[1] + off[1], center[2] + off[2],
        nWorld[0], nWorld[1], nWorld[2],
        0, 0,                 // uv (unused — flat colors)
        bone, 0, 0, 0,        // joints
        1, 0, 0, 0,           // weights (rigid)
        color[0], color[1], color[2], // per-box flat color
      );
    }
    out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    out.v += 4;
  }
};

/** Axis-aligned box: center + half-extents [hx,hy,hz]. */
const addAABB = (out, center, h, color, bone) =>
  addBox(out, center, h, { u: [1, 0, 0], v: [0, 1, 0], axis: [0, 0, 1] }, color, bone);

/** Limb box spanning A→B with rectangular cross-section (halfW × halfD). */
const addLimb = (out, A, B, halfW, halfD, color, bone) => {
  const axis = norm(sub(B, A));
  const ref = Math.abs(axis[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(ref, axis));
  const v = cross(axis, u);
  const center = scale(add(A, B), 0.5);
  addBox(out, center, [halfW, halfD, len(sub(B, A)) / 2], { u, v, axis }, color, bone);
};

/**
 * Build a skinned voxel avatar mesh from parameters + a Mixamo skeleton.
 * @param {object} params - avatar parameters (see DEFAULT_VOXEL_PARAMS)
 * @param {{joints:string[], inverseBindMatrices:Float32Array[]}} skeleton
 * @returns {{ vertices: Float32Array, indices: Uint32Array }} interleaved 16-float mesh
 */
export const buildVoxelAvatar = (params, skeleton) => {
  const p = { ...DEFAULT_VOXEL_PARAMS, ...params };
  const { index, pos } = resolveJoints(skeleton);
  const J = (name) => pos[name];
  const B = (name) => index[name] ?? 0;
  const out = { verts: [], indices: [], v: 0 };

  const col = {
    skin: hexToRgb(p.skin), hair: hexToRgb(p.hairColor), eye: hexToRgb(p.eyeColor),
    mouth: hexToRgb(p.mouthColor), shirt: hexToRgb(p.shirtColor),
    pants: hexToRgb(p.pantsColor), shoe: hexToRgb(p.shoeColor),
  };
  const W = p.width, HS = p.head;

  // Joint anchors (bind pose). Front = +Z (toe direction).
  const hips = J('hips'), spine1 = J('spine1'), neck = J('neck'), head = J('head'), headTop = J('headtop_end');
  const torsoH = neck[1] - hips[1];

  // ── Torso ── one box from hips to neck, bound to Spine1 (subtle spine sway).
  addAABB(out, [0, (hips[1] + neck[1]) / 2, 0], [0.16 * W, torsoH / 2, 0.10 * W], col.shirt, B('spine1'));

  // ── Arms ── articulated: upper arm (Arm) + forearm (ForeArm) so the elbow
  // bends with the animation. Single-box fallback swings rigidly from the shoulder.
  const articulated = p.articulated !== false;
  for (const side of ['left', 'right']) {
    if (articulated) {
      addLimb(out, J(side + 'arm'), J(side + 'forearm'), 0.055 * W, 0.055 * W, col.skin, B(side + 'arm'));
      addLimb(out, J(side + 'forearm'), J(side + 'hand'), 0.05 * W, 0.05 * W, col.skin, B(side + 'forearm'));
    } else {
      addLimb(out, J(side + 'arm'), J(side + 'hand'), 0.055 * W, 0.055 * W, col.skin, B(side + 'arm'));
    }
  }

  // ── Legs ── articulated: thigh (UpLeg) + shin (Leg) so the knee bends.
  for (const side of ['left', 'right']) {
    if (articulated) {
      addLimb(out, J(side + 'upleg'), J(side + 'leg'), 0.06 * W, 0.06 * W, col.pants, B(side + 'upleg'));
      addLimb(out, J(side + 'leg'), J(side + 'foot'), 0.055 * W, 0.055 * W, col.pants, B(side + 'leg'));
    } else {
      addLimb(out, J(side + 'upleg'), J(side + 'foot'), 0.06 * W, 0.06 * W, col.pants, B(side + 'upleg'));
    }
    // Shoe: small box at the ankle, slightly forward, bound to Foot.
    const f = J(side + 'foot');
    addAABB(out, [f[0], f[1] - 0.01, f[2] + 0.05], [0.07, 0.05, 0.11], col.shoe, B(side + 'foot'));
  }

  // ── Head ── cube around the head, bound to Head.
  const headC = [0, (neck[1] + headTop[1]) / 2 + 0.02, head[2]];
  const hh = 0.14 * HS;          // head half-size
  const fz = headC[2] + hh;      // front face (+Z)
  addAABB(out, headC, [hh, hh, hh], col.skin, B('head'));

  // Eyes + mouth + nose on the front (+Z) face.
  const headBone = B('head');
  addAABB(out, [-0.06 * HS, headC[1] + 0.03, fz], [0.035, 0.04, 0.02], col.eye, headBone);
  addAABB(out, [0.06 * HS, headC[1] + 0.03, fz], [0.035, 0.04, 0.02], col.eye, headBone);
  addAABB(out, [0, headC[1] - 0.06, fz + 0.008], [0.05, 0.02, 0.02], col.mouth, headBone);   // slightly proud of the beard plane (fz+0.02) to avoid z-fighting
  if (p.nose === 'small') addAABB(out, [0, headC[1] - 0.01, fz + 0.01], [0.022, 0.03, 0.02], col.skin, headBone);
  if (p.nose === 'long') addAABB(out, [0, headC[1] - 0.01, fz + 0.03], [0.025, 0.035, 0.045], col.skin, headBone);
  if (p.ears === 'human') for (const s of [-1, 1]) addAABB(out, [s * (hh + 0.01), headC[1], head[2]], [0.02, 0.05, 0.03], col.skin, headBone);
  if (p.ears === 'elf') for (const s of [-1, 1]) addAABB(out, [s * (hh + 0.03), headC[1] + 0.03, head[2]], [0.05, 0.02, 0.03], col.skin, headBone);

  // Hair (subset of styles), bound to Head.
  const topY = headC[1] + hh;
  if (p.hair === 'short' || p.hair === 'flat' || p.hair === 'side') {
    addAABB(out, [0, topY + 0.02, head[2]], [hh + 0.01, 0.04, hh + 0.01], col.hair, headBone);
    if (p.hair !== 'flat') for (const s of [-1, 1]) addAABB(out, [s * (hh + 0.005), headC[1] + 0.05, head[2]], [0.02, 0.07, hh], col.hair, headBone);
  }
  if (p.hair === 'mohawk') for (const z of [-0.05, 0, 0.05]) addAABB(out, [0, topY + 0.06, head[2] + z], [0.035, 0.07, 0.03], col.hair, headBone);
  if (p.hair === 'long') {
    addAABB(out, [0, topY + 0.02, head[2]], [hh + 0.01, 0.04, hh + 0.01], col.hair, headBone);
    addAABB(out, [0, headC[1] - 0.05, head[2] - hh - 0.01], [hh, 0.13, 0.02], col.hair, headBone); // back
  }
  if (p.hair === 'spikes') for (const x of [-0.06, -0.02, 0.02, 0.06]) addAABB(out, [x, topY + 0.06, head[2]], [0.025, 0.07, 0.03], col.hair, headBone);

  // Beard, bound to Head.
  if (p.beard === 'goatee') addAABB(out, [0, headC[1] - 0.10, fz], [0.035, 0.04, 0.02], col.hair, headBone);
  if (p.beard === 'full') { addAABB(out, [0, headC[1] - 0.09, fz], [0.11, 0.05, 0.02], col.hair, headBone); for (const s of [-1, 1]) addAABB(out, [s * 0.1, headC[1] - 0.02, fz], [0.02, 0.07, 0.02], col.hair, headBone); }
  if (p.beard === 'mustache') for (const s of [-1, 1]) addAABB(out, [s * 0.03, headC[1] - 0.04, fz + 0.005], [0.035, 0.013, 0.02], col.hair, headBone);
  if (p.beard === 'stubble') addAABB(out, [0, headC[1] - 0.06, fz - 0.005], [0.09, 0.05, 0.01], mul(col.hair, 0.65), headBone);

  // Glasses, bound to Head. Pushed clearly in FRONT of the eyes (front face ≈ fz+0.04 vs the
  // eyes' fz+0.02) — coplanar fronts were z-fighting (glasses-black vs eye-colour flicker).
  if (p.glasses !== 'none') {
    const gy = headC[1] + 0.03, black = [0.02, 0.025, 0.03];
    const gw = p.glasses === 'sun' ? 0.05 : 0.045;
    for (const s of [-1, 1]) addAABB(out, [s * 0.06 * HS, gy, fz + 0.025], [gw, 0.03, 0.015], black, headBone);
    addAABB(out, [0, gy, fz + 0.025], [0.025, 0.012, 0.012], black, headBone);
  }

  // Hat, bound to Head.
  if (p.hat !== 'none') {
    const hy = topY + 0.04;
    const C = { cap: [0.85, 0.05, 0.05], beanie: [0.85, 0.05, 0.05], helmet: [0.45, 0.5, 0.55], crown: [1, 0.75, 0.08], tophat: [0.02, 0.025, 0.03] }[p.hat] || [0.2, 0.2, 0.2];
    addAABB(out, [0, hy, head[2]], [hh + 0.02, 0.05, hh + 0.02], C, headBone);
    if (p.hat === 'cap') addAABB(out, [0, hy - 0.03, fz + 0.05], [0.09, 0.02, 0.05], C, headBone);
    if (p.hat === 'tophat') addAABB(out, [0, hy + 0.12, head[2]], [0.1, 0.12, 0.1], C, headBone);
  }

  // ── Torso pattern (front, +Z), bound to Spine1.
  if (p.pattern && p.pattern !== 'none') {
    const fzT = 0.10 * W + 0.005, cy = (hips[1] + neck[1]) / 2, accent = mix(col.shirt, [1, 1, 1], 0.25);
    const tech = [0, 0.95, 1];
    if (p.pattern === 'stripes') for (const y of [0.12, -0.06]) addAABB(out, [0, cy + y, fzT], [0.16 * W, 0.02, 0.005], accent, B('spine1'));
    if (p.pattern === 'grid') { for (const x of [-0.08, 0.08]) addAABB(out, [x, cy, fzT], [0.012, torsoH / 2.4, 0.005], accent, B('spine1')); addAABB(out, [0, cy, fzT], [0.16 * W, 0.012, 0.005], accent, B('spine1')); }
    if (p.pattern === 'tech') { addAABB(out, [0.04, cy + 0.05, fzT], [0.012, 0.08, 0.005], tech, B('spine1')); addAABB(out, [-0.05, cy - 0.05, fzT], [0.06, 0.012, 0.005], tech, B('spine1')); }
    if (p.pattern === 'diamond') addAABB(out, [0, cy, fzT], [0.04, 0.05, 0.005], accent, B('spine1'));
    if (p.pattern === 'gradient') for (const [y, t] of [[0.12, 0.35], [-0.06, 0.15]]) addAABB(out, [0, cy + y, fzT], [0.16 * W, 0.05, 0.005], mix(col.shirt, [1, 1, 1], t), B('spine1'));
  }

  return {
    vertices: new Float32Array(out.verts),
    indices: new Uint32Array(out.indices),
  };
};
