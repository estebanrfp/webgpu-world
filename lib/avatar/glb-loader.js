/**
 * ========================================
 * GLB/glTF Loader for WebGPU
 * ========================================
 * Loads GLB files with skeletal animation support
 */

// ============================================
// QUATERNION UTILITIES
// ============================================

export const quatMultiply = (a, b) => {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
};

export const quatSlerp = (a, b, t) => {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

  const b2 = dot < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  dot = Math.abs(dot);

  if (dot > 0.9995) {
    const result = [
      a[0] + t * (b2[0] - a[0]),
      a[1] + t * (b2[1] - a[1]),
      a[2] + t * (b2[2] - a[2]),
      a[3] + t * (b2[3] - a[3])
    ];
    const len = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2 + result[3] ** 2);
    return result.map(v => v / len);
  }

  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;

  return [
    wa * a[0] + wb * b2[0],
    wa * a[1] + wb * b2[1],
    wa * a[2] + wb * b2[2],
    wa * a[3] + wb * b2[3]
  ];
};

export const vec3Lerp = (a, b, t) => [
  a[0] + t * (b[0] - a[0]),
  a[1] + t * (b[1] - a[1]),
  a[2] + t * (b[2] - a[2])
];

// Create matrix from TRS
export const trsToMatrix = (t, r, s) => {
  const x = r[0], y = r[1], z = r[2], w = r[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  return new Float32Array([
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ]);
};

export const mat4Multiply = (a, b) => {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] =
        a[i] * b[j * 4] +
        a[i + 4] * b[j * 4 + 1] +
        a[i + 8] * b[j * 4 + 2] +
        a[i + 12] * b[j * 4 + 3];
    }
  }
  return out;
};

// ============================================
// GLB LOADER
// ============================================

/**
 * Load and parse a GLB file
 * @param {string} url - URL to the GLB file
 * @returns {Promise<{json: Object, bin: ArrayBuffer}>}
 */
export async function loadGLB(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const dataView = new DataView(buffer);

  // Parse GLB header
  const magic = dataView.getUint32(0, true);
  if (magic !== 0x46546C67) throw new Error('Invalid GLB magic');

  const version = dataView.getUint32(4, true);
  const length = dataView.getUint32(8, true);

  // Parse chunks
  let offset = 12;
  let jsonChunk = null;
  let binChunk = null;

  while (offset < length) {
    const chunkLength = dataView.getUint32(offset, true);
    const chunkType = dataView.getUint32(offset + 4, true);
    offset += 8;

    if (chunkType === 0x4E4F534A) { // JSON
      const jsonArray = new Uint8Array(buffer, offset, chunkLength);
      jsonChunk = JSON.parse(new TextDecoder().decode(jsonArray));
    } else if (chunkType === 0x004E4942) { // BIN
      binChunk = new ArrayBuffer(chunkLength);
      new Uint8Array(binChunk).set(new Uint8Array(buffer, offset, chunkLength));
    }
    offset += chunkLength;
  }

  return { json: jsonChunk, bin: binChunk };
}

/**
 * Load texture from GLB binary data
 * @param {Object} gltf - Parsed glTF JSON
 * @param {ArrayBuffer} bin - Binary data
 * @param {number} textureIndex - Index of texture to load
 * @param {GPUDevice} device - WebGPU device
 * @returns {Promise<GPUTexture|null>}
 */
export async function loadTextureFromGLB(gltf, bin, textureIndex, device) {
  if (!gltf.textures || textureIndex >= gltf.textures.length) return null;

  const texture = gltf.textures[textureIndex];
  const imageIndex = texture.source;
  if (imageIndex === undefined || !gltf.images) return null;

  const image = gltf.images[imageIndex];

  if (image.bufferView !== undefined) {
    const bufferView = gltf.bufferViews[image.bufferView];
    const byteOffset = bufferView.byteOffset || 0;
    const byteLength = bufferView.byteLength;

    const imageData = new Uint8Array(bin, byteOffset, byteLength);
    const blob = new Blob([imageData], { type: image.mimeType || 'image/png' });

    try {
      // Decoded straight from the blob: routing it through an <img> meant
      // waiting on HTMLImageElement.decode(), which never settles while the
      // document is hidden, so a background tab hung here forever. The object
      // URL that detour required is gone with it.
      const bitmap = await createImageBitmap(blob);
      const gpuTexture = device.createTexture({
        size: [bitmap.width, bitmap.height, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: gpuTexture },
        [bitmap.width, bitmap.height]
      );

      return gpuTexture;
    } catch (e) {
      console.error('Failed to load texture:', e);
      return null;
    }
  }

  return null;
}

/**
 * Extract mesh data from glTF
 * @param {Object} gltf - Parsed glTF JSON
 * @param {ArrayBuffer} bin - Binary data
 * @returns {Array} Array of mesh data objects
 */
export function extractMeshData(gltf, bin) {
  const meshes = [];
  const dataView = new DataView(bin);

  const readFloat32 = (offset) => dataView.getFloat32(offset, true);
  const readUint16 = (offset) => dataView.getUint16(offset, true);
  const readUint32 = (offset) => dataView.getUint32(offset, true);

  const getAccessorData = (accessorIndex, componentsPerElement) => {
    const accessor = gltf.accessors[accessorIndex];
    const bufferView = gltf.bufferViews[accessor.bufferView];

    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const defaultStride = componentsPerElement * 4;
    const stride = bufferView.byteStride || defaultStride;

    const result = new Float32Array(count * componentsPerElement);

    for (let i = 0; i < count; i++) {
      const elementOffset = baseOffset + i * stride;
      for (let j = 0; j < componentsPerElement; j++) {
        result[i * componentsPerElement + j] = readFloat32(elementOffset + j * 4);
      }
    }

    return result;
  };

  const getIndexData = (accessorIndex) => {
    const accessor = gltf.accessors[accessorIndex];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;

    const result = new Uint32Array(count);

    if (accessor.componentType === 5123) {
      for (let i = 0; i < count; i++) {
        result[i] = readUint16(baseOffset + i * 2);
      }
    } else if (accessor.componentType === 5125) {
      for (let i = 0; i < count; i++) {
        result[i] = readUint32(baseOffset + i * 4);
      }
    }

    return result;
  };

  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (primitive.attributes.POSITION === undefined) continue;

      const positions = getAccessorData(primitive.attributes.POSITION, 3);

      let normals = null;
      if (primitive.attributes.NORMAL !== undefined) {
        normals = getAccessorData(primitive.attributes.NORMAL, 3);
      }

      let uvs = null;
      if (primitive.attributes.TEXCOORD_0 !== undefined) {
        uvs = getAccessorData(primitive.attributes.TEXCOORD_0, 2);
      }

      let indices = null;
      if (primitive.indices !== undefined) {
        indices = getIndexData(primitive.indices);
      }

      if (positions.length > 0) {
        let baseColorTextureIndex = null;
        let baseColorFactor = [1, 1, 1, 1];

        if (primitive.material !== undefined && gltf.materials) {
          const material = gltf.materials[primitive.material];
          if (material.pbrMetallicRoughness) {
            const pbr = material.pbrMetallicRoughness;
            if (pbr.baseColorTexture) {
              baseColorTextureIndex = pbr.baseColorTexture.index;
            }
            if (pbr.baseColorFactor) {
              baseColorFactor = pbr.baseColorFactor;
            }
          }
        }

        meshes.push({
          positions, normals, uvs, indices,
          baseColorTextureIndex,
          baseColorFactor
        });
        console.log(`Mesh: ${positions.length / 3} verts, ${indices ? indices.length : 0} indices, texture: ${baseColorTextureIndex}`);
      }
    }
  }

  return meshes;
}

/**
 * Extract skeleton/skin data from glTF
 * @param {Object} gltf - Parsed glTF JSON
 * @param {ArrayBuffer} bin - Binary data
 * @returns {Object|null} Skeleton data or null
 */
export function extractSkeleton(gltf, bin) {
  if (!gltf.skins || gltf.skins.length === 0) {
    console.log('No skeleton found in GLB');
    return null;
  }

  const skin = gltf.skins[0];
  const joints = skin.joints;
  const jointNames = joints.map(idx => gltf.nodes[idx].name || `Joint_${idx}`);

  console.log('Skeleton joints:', jointNames);

  let inverseBindMatrices = null;
  if (skin.inverseBindMatrices !== undefined) {
    const accessor = gltf.accessors[skin.inverseBindMatrices];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const dataView = new DataView(bin);

    inverseBindMatrices = [];
    for (let i = 0; i < accessor.count; i++) {
      const mat = new Float32Array(16);
      for (let j = 0; j < 16; j++) {
        mat[j] = dataView.getFloat32(byteOffset + (i * 16 + j) * 4, true);
      }
      inverseBindMatrices.push(mat);
    }
  }

  const jointHierarchy = joints.map(idx => {
    const node = gltf.nodes[idx];
    return {
      name: node.name || `Joint_${idx}`,
      translation: node.translation || [0, 0, 0],
      rotation: node.rotation || [0, 0, 0, 1],
      scale: node.scale || [1, 1, 1],
      children: (node.children || []).map(childIdx => joints.indexOf(childIdx)).filter(i => i >= 0)
    };
  });

  return {
    joints: jointNames,
    inverseBindMatrices,
    hierarchy: jointHierarchy,
    jointCount: joints.length
  };
}

/**
 * Extract skinning weights from mesh primitives
 * @param {Object} gltf - Parsed glTF JSON
 * @param {ArrayBuffer} bin - Binary data
 * @returns {Object} Skinning data with joints and weights
 */
export function extractSkinningData(gltf, bin) {
  const dataView = new DataView(bin);

  const readFloat32 = (offset) => dataView.getFloat32(offset, true);
  const readUint8 = (offset) => dataView.getUint8(offset);
  const readUint16 = (offset) => dataView.getUint16(offset, true);

  const getAccessorDataTyped = (accessorIndex, componentsPerElement, readFunc, bytesPerComponent) => {
    const accessor = gltf.accessors[accessorIndex];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const stride = bufferView.byteStride || (componentsPerElement * bytesPerComponent);

    const result = [];
    for (let i = 0; i < count; i++) {
      const elementOffset = baseOffset + i * stride;
      const element = [];
      for (let j = 0; j < componentsPerElement; j++) {
        element.push(readFunc(elementOffset + j * bytesPerComponent));
      }
      result.push(element);
    }
    return result;
  };

  let allJoints = [];
  let allWeights = [];

  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (primitive.attributes.JOINTS_0 !== undefined) {
        const accessor = gltf.accessors[primitive.attributes.JOINTS_0];
        if (accessor.componentType === 5121) {
          const joints = getAccessorDataTyped(primitive.attributes.JOINTS_0, 4, readUint8, 1);
          allJoints.push(...joints);
        } else if (accessor.componentType === 5123) {
          const joints = getAccessorDataTyped(primitive.attributes.JOINTS_0, 4, readUint16, 2);
          allJoints.push(...joints);
        }
      }

      if (primitive.attributes.WEIGHTS_0 !== undefined) {
        const accessor = gltf.accessors[primitive.attributes.WEIGHTS_0];
        const bufferView = gltf.bufferViews[accessor.bufferView];
        const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
        const count = accessor.count;
        const stride = bufferView.byteStride || 16;

        for (let i = 0; i < count; i++) {
          const offset = baseOffset + i * stride;
          allWeights.push([
            readFloat32(offset),
            readFloat32(offset + 4),
            readFloat32(offset + 8),
            readFloat32(offset + 12)
          ]);
        }
      }
    }
  }

  console.log(`Skinning data: ${allJoints.length} vertices with weights`);
  return { joints: allJoints, weights: allWeights };
}

/**
 * Extract animations from glTF
 * @param {Object} gltf - Parsed glTF JSON
 * @param {ArrayBuffer} bin - Binary data
 * @returns {Object} Animations keyed by name
 */
export function extractAnimations(gltf, bin) {
  if (!gltf.animations || gltf.animations.length === 0) {
    console.log('No animations found');
    return {};
  }

  const dataView = new DataView(bin);
  const readFloat32 = (offset) => dataView.getFloat32(offset, true);

  const getFloatAccessor = (accessorIndex) => {
    const accessor = gltf.accessors[accessorIndex];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;

    let components = 1;
    if (accessor.type === 'VEC3') components = 3;
    else if (accessor.type === 'VEC4') components = 4;

    const result = [];
    for (let i = 0; i < count; i++) {
      if (components === 1) {
        result.push(readFloat32(baseOffset + i * 4));
      } else {
        const vec = [];
        for (let j = 0; j < components; j++) {
          vec.push(readFloat32(baseOffset + (i * components + j) * 4));
        }
        result.push(vec);
      }
    }
    return result;
  };

  const animations = {};

  for (const anim of gltf.animations) {
    const name = anim.name || 'default';
    const tracks = [];

    for (const channel of anim.channels) {
      const sampler = anim.samplers[channel.sampler];
      const targetNode = channel.target.node;
      const targetPath = channel.target.path;

      const times = getFloatAccessor(sampler.input);
      const values = getFloatAccessor(sampler.output);

      const nodeName = gltf.nodes[targetNode]?.name || `Node_${targetNode}`;

      tracks.push({
        nodeName,
        property: targetPath,
        times,
        values,
        interpolation: sampler.interpolation || 'LINEAR'
      });
    }

    animations[name] = {
      name,
      tracks,
      duration: Math.max(...tracks.flatMap(t => t.times))
    };

    console.log(`Animation "${name}": ${tracks.length} tracks, ${animations[name].duration.toFixed(2)}s`);
  }

  return animations;
}

/**
 * Create interleaved vertex buffer for character with skinning data
 * @param {Array} meshData - Array of mesh data
 * @param {Object} skinningData - Skinning data with joints and weights
 * @returns {Object} Vertices and indices as typed arrays
 */
export function createCharacterBuffers(meshData, skinningData) {
  const allVertices = [];
  const allIndices = [];
  let indexOffset = 0;
  let globalVertexIndex = 0;

  for (const mesh of meshData) {
    const vertexCount = mesh.positions.length / 3;

    for (let i = 0; i < vertexCount; i++) {
      // Position (3)
      allVertices.push(mesh.positions[i * 3]);
      allVertices.push(mesh.positions[i * 3 + 1]);
      allVertices.push(mesh.positions[i * 3 + 2]);

      // Normal (3)
      if (mesh.normals) {
        allVertices.push(mesh.normals[i * 3]);
        allVertices.push(mesh.normals[i * 3 + 1]);
        allVertices.push(mesh.normals[i * 3 + 2]);
      } else {
        allVertices.push(0, 1, 0);
      }

      // UV (2)
      if (mesh.uvs) {
        allVertices.push(mesh.uvs[i * 2]);
        allVertices.push(mesh.uvs[i * 2 + 1]);
      } else {
        allVertices.push(0, 0);
      }

      // Joint indices (4)
      if (skinningData && skinningData.joints[globalVertexIndex]) {
        const joints = skinningData.joints[globalVertexIndex];
        allVertices.push(joints[0], joints[1], joints[2], joints[3]);
      } else {
        allVertices.push(0, 0, 0, 0);
      }

      // Weights (4)
      if (skinningData && skinningData.weights[globalVertexIndex]) {
        const weights = skinningData.weights[globalVertexIndex];
        allVertices.push(weights[0], weights[1], weights[2], weights[3]);
      } else {
        allVertices.push(1, 0, 0, 0);
      }

      globalVertexIndex++;
    }

    if (mesh.indices) {
      for (const idx of mesh.indices) {
        allIndices.push(idx + indexOffset);
      }
    }

    indexOffset += vertexCount;
  }

  return {
    vertices: new Float32Array(allVertices),
    indices: new Uint32Array(allIndices)
  };
}
