/**
 * Geometry Generation Module
 * Creates procedural geometry for terrain and ocean planes
 */

/**
 * Creates a plane geometry with vertices and indices
 * @param {number} size - Total size of the plane
 * @param {number} segments - Number of segments per side
 * @returns {{ vertices: Float32Array, indices: Uint32Array }}
 */
export function createPlaneGeometry(size, segments) {
  const vertices = [];
  const indices = [];
  const step = size / segments;
  const half = size / 2;

  for (let z = 0; z <= segments; z++) {
    for (let x = 0; x <= segments; x++) {
      vertices.push(x * step - half, 0, z * step - half);
      vertices.push(x / segments, z / segments);
    }
  }

  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const i = z * (segments + 1) + x;
      indices.push(i, i + segments + 1, i + 1);
      indices.push(i + 1, i + segments + 1, i + segments + 2);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices)
  };
}

/**
 * Creates GPU buffers for geometry
 * @param {GPUDevice} device - WebGPU device
 * @param {{ vertices: Float32Array, indices: Uint32Array }} geometry
 * @returns {{ vertexBuffer: GPUBuffer, indexBuffer: GPUBuffer, indexCount: number }}
 */
export function createGeometryBuffers(device, geometry) {
  const vertexBuffer = device.createBuffer({
    size: geometry.vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, geometry.vertices);

  const indexBuffer = device.createBuffer({
    size: geometry.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, geometry.indices);

  return {
    vertexBuffer,
    indexBuffer,
    indexCount: geometry.indices.length
  };
}

/**
 * Creates terrain geometry with default settings
 * @param {GPUDevice} device - WebGPU device
 * @param {number} size - Terrain size (default 4000)
 * @param {number} segments - Terrain segments (default 256)
 */
export function createTerrainGeometry(device, size = 4000, segments = 256) {
  const geometry = createPlaneGeometry(size, segments);
  return createGeometryBuffers(device, geometry);
}

/**
 * Creates ocean geometry with default settings
 * @param {GPUDevice} device - WebGPU device  
 * @param {number} size - Ocean size (default 20000)
 * @param {number} segments - Ocean segments (default 128)
 */
export function createOceanGeometry(device, size = 20000, segments = 128) {
  const geometry = createPlaneGeometry(size, segments);
  return createGeometryBuffers(device, geometry);
}
