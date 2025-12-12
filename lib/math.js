/**
 * Matrix and Vector Math Utilities
 * 
 * Provides essential matrix operations for 3D graphics:
 * - Projection matrices (perspective)
 * - View matrices (lookAt)
 * - Transform matrices (translate, rotateY, scale)
 * - Matrix multiplication
 * - Vector operations (normalize, cross, dot)
 * 
 * All matrices are returned as Float32Array in column-major order
 * compatible with WebGPU/WGSL mat4x4f uniforms.
 */

/**
 * Create a perspective projection matrix
 * @param {number} fov - Field of view in radians
 * @param {number} aspect - Aspect ratio (width / height)
 * @param {number} near - Near clipping plane
 * @param {number} far - Far clipping plane
 * @returns {Float32Array} 4x4 projection matrix
 */
export const perspective = (fov, aspect, near, far) => {
  const t = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    t / aspect, 0, 0, 0,
    0, t, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
};

/**
 * Normalize a 3D vector
 * @param {number[]} v - Vector [x, y, z]
 * @returns {number[]} Normalized vector
 */
export const normalize3 = (v) => {
  const l = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  if (l === 0) return [0, 0, 0];
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Cross product of two 3D vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number[]} Cross product a × b
 */
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

/**
 * Dot product of two 3D vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Dot product a · b
 */
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Create a look-at view matrix
 * @param {number[]} eye - Camera position [x, y, z]
 * @param {number[]} target - Target position [x, y, z]
 * @param {number[]} up - Up vector [x, y, z]
 * @returns {Float32Array} 4x4 view matrix
 */
export const lookAt = (eye, target, up) => {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize3(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
};

/**
 * Multiply two 4x4 matrices
 * @param {Float32Array} a - First matrix
 * @param {Float32Array} b - Second matrix
 * @returns {Float32Array} Result a * b
 */
export const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      o[j * 4 + i] = a[i] * b[j * 4] + a[i + 4] * b[j * 4 + 1] + a[i + 8] * b[j * 4 + 2] + a[i + 12] * b[j * 4 + 3];
    }
  }
  return o;
};

/**
 * Create a 4x4 identity matrix
 * @returns {Float32Array} Identity matrix
 */
export const identity = () => new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
]);

/**
 * Create a rotation matrix around the Y axis
 * @param {number} angle - Rotation angle in radians
 * @returns {Float32Array} 4x4 rotation matrix
 */
export const rotateY = (angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
};

/**
 * Create a rotation matrix around the X axis
 * @param {number} angle - Rotation angle in radians
 * @returns {Float32Array} 4x4 rotation matrix
 */
export const rotateX = (angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1
  ]);
};

/**
 * Create a rotation matrix around the Z axis
 * @param {number} angle - Rotation angle in radians
 * @returns {Float32Array} 4x4 rotation matrix
 */
export const rotateZ = (angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
};

/**
 * Create a translation matrix
 * @param {number} x - X translation
 * @param {number} y - Y translation
 * @param {number} z - Z translation
 * @returns {Float32Array} 4x4 translation matrix
 */
export const translate = (x, y, z) => new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  x, y, z, 1
]);

/**
 * Create a uniform scale matrix
 * @param {number} s - Scale factor
 * @returns {Float32Array} 4x4 scale matrix
 */
export const scale = (s) => new Float32Array([
  s, 0, 0, 0,
  0, s, 0, 0,
  0, 0, s, 0,
  0, 0, 0, 1
]);

/**
 * Create a non-uniform scale matrix
 * @param {number} sx - X scale factor
 * @param {number} sy - Y scale factor
 * @param {number} sz - Z scale factor
 * @returns {Float32Array} 4x4 scale matrix
 */
export const scale3 = (sx, sy, sz) => new Float32Array([
  sx, 0, 0, 0,
  0, sy, 0, 0,
  0, 0, sz, 0,
  0, 0, 0, 1
]);

/**
 * Invert a 4x4 matrix
 * @param {Float32Array} m - Matrix to invert
 * @returns {Float32Array|null} Inverted matrix or null if singular
 */
export const invert = (m) => {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (det === 0) return null;

  const invDet = 1.0 / det;
  return new Float32Array([
    (a11 * b11 - a12 * b10 + a13 * b09) * invDet,
    (a02 * b10 - a01 * b11 - a03 * b09) * invDet,
    (a31 * b05 - a32 * b04 + a33 * b03) * invDet,
    (a22 * b04 - a21 * b05 - a23 * b03) * invDet,
    (a12 * b08 - a10 * b11 - a13 * b07) * invDet,
    (a00 * b11 - a02 * b08 + a03 * b07) * invDet,
    (a32 * b02 - a30 * b05 - a33 * b01) * invDet,
    (a20 * b05 - a22 * b02 + a23 * b01) * invDet,
    (a10 * b10 - a11 * b08 + a13 * b06) * invDet,
    (a01 * b08 - a00 * b10 - a03 * b06) * invDet,
    (a30 * b04 - a31 * b02 + a33 * b00) * invDet,
    (a21 * b02 - a20 * b04 - a23 * b00) * invDet,
    (a11 * b07 - a10 * b09 - a12 * b06) * invDet,
    (a00 * b09 - a01 * b07 + a02 * b06) * invDet,
    (a31 * b01 - a30 * b03 - a32 * b00) * invDet,
    (a20 * b03 - a21 * b01 + a22 * b00) * invDet
  ]);
};

/**
 * Linear interpolation between two values
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Clamp a value between min and max
 * @param {number} v - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Convert degrees to radians
 * @param {number} deg - Angle in degrees
 * @returns {number} Angle in radians
 */
export const degToRad = (deg) => deg * Math.PI / 180;

/**
 * Convert radians to degrees
 * @param {number} rad - Angle in radians
 * @returns {number} Angle in degrees
 */
export const radToDeg = (rad) => rad * 180 / Math.PI;
