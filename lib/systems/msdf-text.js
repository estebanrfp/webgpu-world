/**
 * MSDF Text System - High-performance text rendering for WebGPU
 * Multi-channel Signed Distance Field fonts for crisp text at any scale
 * VR-ready, GPU instanced, supports thousands of labels
 */

// MSDF Configuration
const MSDF_CONFIG = {
  atlasSize: 512,              // Atlas texture size
  fontSize: 42,                // Font size for atlas generation
  padding: 4,                  // Padding around glyphs
  charset: ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~áéíóúñÁÉÍÓÚÑ¿¡',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontWeight: 'bold',
  // Rendering
  sdfRange: 4,                 // Distance field range in pixels
  maxInstances: 10000,         // Max characters on screen
  maxLabels: 500,              // Max text labels (names, dialogs)
};

/**
 * MSDF Shader for WebGPU - Billboard text rendering
 */
const msdfShader = /* wgsl */`
  struct Camera {
    viewProjection: mat4x4f,
    position: vec3f,
    time: f32,
    cloudCoverage: f32,
    starBlur: f32,
    skyDarkening: f32,
    lightningFlash: f32,
    lightningPosX: f32,
    lightningPosY: f32,
    dayTime: f32,
  }

  struct TextInstance {
    worldPos: vec3f,          // Position in world space
    charIndex: f32,           // Character index in atlas (packed)
    uvRect: vec4f,            // UV coordinates (x, y, width, height)
    offset: vec2f,            // Offset from anchor point
    size: vec2f,              // Character size
    color: vec4f,             // Text color with alpha
    outlineColor: vec4f,      // Outline color
    flags: f32,               // Bit flags (billboard, outline, etc)
    scale: f32,               // Text scale
  }

  @group(0) @binding(0) var<uniform> camera: Camera;
  @group(0) @binding(1) var<storage, read> instances: array<TextInstance>;
  @group(0) @binding(2) var msdfTexture: texture_2d<f32>;
  @group(0) @binding(3) var msdfSampler: sampler;

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
    @location(1) color: vec4f,
    @location(2) outlineColor: vec4f,
    @location(3) flags: f32,
  }

  @vertex
  fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
  ) -> VertexOutput {
    var out: VertexOutput;
    
    let inst = instances[instanceIndex];
    
    // Skip if alpha is 0
    if (inst.color.a <= 0.0) {
      out.position = vec4f(0.0, 0.0, -10.0, 1.0);
      return out;
    }
    
    // Quad vertices (two triangles) - with X flipped for correct text orientation
    var positions = array<vec2f, 6>(
      vec2f(1.0, 0.0), vec2f(0.0, 0.0), vec2f(0.0, 1.0),
      vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0)
    );
    
    let localPos = positions[vertexIndex];
    
    // UV mapping from atlas rect (normal orientation)
    out.uv = vec2f(
      inst.uvRect.x + localPos.x * inst.uvRect.z,
      inst.uvRect.y + localPos.y * inst.uvRect.w
    );
    
    // Billboard calculation
    let isBillboard = (u32(inst.flags) & 1u) != 0u;
    
    var worldPos: vec3f;
    
    if (isBillboard) {
      // Face camera - compute billboard basis vectors
      let forward = normalize(inst.worldPos - camera.position);
      let worldUp = vec3f(0.0, 1.0, 0.0);
      let right = normalize(cross(worldUp, forward));
      let up = worldUp;
      
      // Apply character offset and size with global scale
      let globalScale = inst.scale * 2.0; // World units scale
      let charOffset = (inst.offset + localPos * inst.size) * globalScale;
      
      worldPos = inst.worldPos + right * charOffset.x + up * charOffset.y;
    } else {
      // Screen-space text (for UI)
      let charOffset = inst.offset + localPos * inst.size;
      worldPos = inst.worldPos + vec3f(charOffset * inst.scale, 0.0);
    }
    
    out.position = camera.viewProjection * vec4f(worldPos, 1.0);
    out.color = inst.color;
    out.outlineColor = inst.outlineColor;
    out.flags = inst.flags;
    
    return out;
  }

  // MSDF median function
  fn median(r: f32, g: f32, b: f32) -> f32 {
    return max(min(r, g), min(max(r, g), b));
  }

  @fragment
  fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    // Sample MSDF texture
    let msdf = textureSample(msdfTexture, msdfSampler, in.uv);
    
    // Calculate signed distance
    let sd = median(msdf.r, msdf.g, msdf.b);
    
    // Screen-space derivative for anti-aliasing
    let screenPxDistance = max(fwidth(sd), 1e-4);
    
    // Smoothstep for anti-aliased edge
    let alpha = smoothstep(0.5 - screenPxDistance, 0.5 + screenPxDistance, sd);
    
    // Check for outline
    let hasOutline = (u32(in.flags) & 2u) != 0u;
    
    var finalColor: vec4f;
    
    if (hasOutline) {
      // Thicker outline for better visibility
      let outlineWidth = 0.2;
      let outerEdge = 0.5 - outlineWidth;
      let outlineAlpha = smoothstep(outerEdge - screenPxDistance, outerEdge + screenPxDistance, sd);
      
      // Blend: outline underneath, text on top
      let textAlpha = alpha * in.color.a;
      let outAlpha = outlineAlpha * in.outlineColor.a * (1.0 - alpha);
      
      let totalAlpha = textAlpha + outAlpha;
      if (totalAlpha < 0.01) {
        discard;
      }
      
      let textContrib = in.color.rgb * textAlpha;
      let outContrib = in.outlineColor.rgb * outAlpha;
      finalColor = vec4f((textContrib + outContrib) / max(totalAlpha, 0.001), totalAlpha);
    } else {
      finalColor = vec4f(in.color.rgb, in.color.a * alpha);
      if (finalColor.a < 0.01) {
        discard;
      }
    }
    
    return finalColor;
  }
`;

/**
 * Generate MSDF atlas using Canvas 2D
 * Creates a multi-channel signed distance field texture
 */
function generateMSDFAtlas(charset, config) {
  const { atlasSize, fontSize, padding, fontFamily, fontWeight, sdfRange } = config;
  
  // Create canvas for font rendering
  const canvas = document.createElement('canvas');
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  // Clear to black (distance = 0)
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, atlasSize, atlasSize);
  
  // Font setup
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  
  // Calculate glyph positions
  const glyphs = {};
  let x = padding;
  let y = padding;
  let lineHeight = fontSize + padding * 2;
  let maxRowHeight = 0;
  
  // Measure and position each character
  for (const char of charset) {
    const metrics = ctx.measureText(char);
    const charWidth = Math.ceil(metrics.width) + padding * 2;
    const charHeight = lineHeight;
    
    // New line if needed
    if (x + charWidth > atlasSize - padding) {
      x = padding;
      y += maxRowHeight;
      maxRowHeight = 0;
    }
    
    if (y + charHeight > atlasSize - padding) {
      console.warn('MSDF Atlas: Not enough space for all characters');
      break;
    }
    
    glyphs[char] = {
      x: x,
      y: y,
      width: charWidth,
      height: charHeight,
      advance: metrics.width,
      // UV coordinates (normalized 0-1)
      u: x / atlasSize,
      v: y / atlasSize,
      uWidth: charWidth / atlasSize,
      vHeight: charHeight / atlasSize,
    };
    
    x += charWidth;
    maxRowHeight = Math.max(maxRowHeight, charHeight);
  }
  
  // Render characters to a temporary canvas for SDF generation
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = atlasSize;
  tempCanvas.height = atlasSize;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  
  // Render white text on black background
  tempCtx.fillStyle = 'black';
  tempCtx.fillRect(0, 0, atlasSize, atlasSize);
  tempCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  tempCtx.textBaseline = 'top';
  tempCtx.textAlign = 'left';
  tempCtx.fillStyle = 'white';
  
  for (const char of charset) {
    const glyph = glyphs[char];
    if (glyph) {
      tempCtx.fillText(char, glyph.x + padding, glyph.y + padding);
    }
  }
  
  // Get image data for SDF generation
  const tempData = tempCtx.getImageData(0, 0, atlasSize, atlasSize);
  const outputData = ctx.createImageData(atlasSize, atlasSize);
  
  // Generate MSDF (simplified - using distance transform)
  generateDistanceField(tempData.data, outputData.data, atlasSize, atlasSize, sdfRange);
  
  ctx.putImageData(outputData, 0, 0);
  
  return { canvas, glyphs, config };
}

/**
 * Generate signed distance field from binary image
 * Uses 8SSEDT (8-point Signed Sequential Euclidean Distance Transform)
 */
function generateDistanceField(input, output, width, height, spread) {
  const INF = 1e10;
  
  // Create distance grids
  const outside = new Float32Array(width * height);
  const inside = new Float32Array(width * height);
  
  // Initialize grids
  for (let i = 0; i < width * height; i++) {
    const alpha = input[i * 4]; // Use red channel as alpha
    if (alpha > 128) {
      outside[i] = 0;
      inside[i] = INF;
    } else {
      outside[i] = INF;
      inside[i] = 0;
    }
  }
  
  // Distance transform (simplified Euclidean)
  edt(outside, width, height);
  edt(inside, width, height);
  
  // Generate MSDF output
  for (let i = 0; i < width * height; i++) {
    // Signed distance
    const dist = Math.sqrt(outside[i]) - Math.sqrt(inside[i]);
    
    // Normalize to 0-1 range based on spread
    const normalized = dist / spread * 0.5 + 0.5;
    const clamped = Math.max(0, Math.min(1, normalized));
    const byte = Math.round(clamped * 255);
    
    // NOTE: This atlas is effectively a single-channel SDF packed into RGB.
    // Keeping R=G=B avoids noisy edges and produces stable, crisp text.
    output[i * 4 + 0] = byte; // R
    output[i * 4 + 1] = byte; // G
    output[i * 4 + 2] = byte; // B
    output[i * 4 + 3] = 255;  // A
  }
}

/**
 * 1D Euclidean Distance Transform
 */
function edt1d(f, d, v, z, n) {
  const INF = 1e10;
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * 2D Euclidean Distance Transform
 */
function edt(data, width, height) {
  const f = new Float32Array(Math.max(width, height));
  const d = new Float32Array(Math.max(width, height));
  const v = new Int32Array(Math.max(width, height));
  const z = new Float32Array(Math.max(width, height) + 1);
  
  // Transform columns
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      f[y] = data[y * width + x];
    }
    edt1d(f, d, v, z, height);
    for (let y = 0; y < height; y++) {
      data[y * width + x] = d[y];
    }
  }
  
  // Transform rows
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      f[x] = data[y * width + x];
    }
    edt1d(f, d, v, z, width);
    for (let x = 0; x < width; x++) {
      data[y * width + x] = d[x];
    }
  }
}

/**
 * Text Label class - represents a piece of text in 3D space
 */
class TextLabel {
  constructor(text, options = {}) {
    this.text = text;
    this.position = options.position || [0, 0, 0];
    this.color = options.color || [1, 1, 1, 1];
    this.outlineColor = options.outlineColor || [0, 0, 0, 0.8];
    this.scale = options.scale || 0.05;
    this.billboard = options.billboard !== false;
    this.outline = options.outline !== false;
    this.anchor = options.anchor || 'center'; // 'left', 'center', 'right'
    this.visible = true;
    this.alpha = 1.0;
    this._dirty = true;
  }
  
  setText(text) {
    if (this.text !== text) {
      this.text = text;
      this._dirty = true;
    }
  }
  
  setPosition(x, y, z) {
    this.position[0] = x;
    this.position[1] = y;
    this.position[2] = z;
  }
  
  setColor(r, g, b, a = 1) {
    this.color[0] = r;
    this.color[1] = g;
    this.color[2] = b;
    this.color[3] = a;
  }
  
  setAlpha(alpha) {
    this.alpha = alpha;
    this.color[3] = alpha;
  }
  
  setScale(scale) {
    this.scale = scale;
  }
}

/**
 * Creates the MSDF Text System
 * @param {GPUDevice} device - WebGPU device
 * @param {Object} options - Configuration options
 */
export function createMSDFTextSystem(device, options = {}) {
  const {
    cameraBuffer,
    maxInstances = MSDF_CONFIG.maxInstances,
    maxLabels = MSDF_CONFIG.maxLabels,
  } = options;
  
  // Generate MSDF atlas
  console.log('[MSDF] Generating font atlas...');
  const atlas = generateMSDFAtlas(MSDF_CONFIG.charset, MSDF_CONFIG);
  console.log('[MSDF] Atlas generated with', Object.keys(atlas.glyphs).length, 'glyphs');
  
  // Create GPU texture from atlas
  const atlasTexture = device.createTexture({
    size: [atlas.config.atlasSize, atlas.config.atlasSize],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    label: 'MSDF Atlas Texture',
  });
  
  // Upload atlas to GPU
  const atlasImageData = atlas.canvas.getContext('2d').getImageData(
    0, 0, atlas.config.atlasSize, atlas.config.atlasSize
  );
  device.queue.writeTexture(
    { texture: atlasTexture },
    atlasImageData.data,
    { bytesPerRow: atlas.config.atlasSize * 4 },
    [atlas.config.atlasSize, atlas.config.atlasSize]
  );
  
  // Create sampler
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    // No mipmaps are generated for the atlas; avoid undefined sampling behavior.
    mipmapFilter: 'nearest',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  
  // Instance buffer (each character instance)
  // Layout: worldPos(3) + charIndex(1) + uvRect(4) + offset(2) + size(2) + color(4) + outlineColor(4) + flags(1) + scale(1) = 22 floats
  const INSTANCE_FLOATS = 24; // Padded to 24 for alignment
  const instanceData = new Float32Array(maxInstances * INSTANCE_FLOATS);
  let instanceCount = 0;
  
  const instanceBuffer = device.createBuffer({
    size: maxInstances * INSTANCE_FLOATS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'MSDF Instance Buffer',
  });
  
  // Create shader module
  const shaderModule = device.createShaderModule({
    code: msdfShader,
    label: 'MSDF Text Shader',
  });
  
  // Create pipeline
  const pipeline = device.createRenderPipeline({
    label: 'MSDF Text Pipeline',
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: navigator.gpu.getPreferredCanvasFormat(),
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none',
    },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: false,
      // UI-like behavior: keep labels readable (match Orillusion-style world UI)
      depthCompare: 'always',
    },
  });
  
  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: instanceBuffer } },
      { binding: 2, resource: atlasTexture.createView() },
      { binding: 3, resource: sampler },
    ],
    label: 'MSDF Text Bind Group',
  });
  
  // Text labels storage
  const labels = new Map();
  let labelIdCounter = 0;
  
  /**
   * Create a new text label
   */
  function createLabel(text, options = {}) {
    const id = labelIdCounter++;
    const label = new TextLabel(text, options);
    labels.set(id, label);
    return id;
  }
  
  /**
   * Update an existing label
   */
  function updateLabel(id, updates) {
    const label = labels.get(id);
    if (!label) return;
    
    if (updates.text !== undefined) label.setText(updates.text);
    if (updates.position !== undefined) label.setPosition(...updates.position);
    if (updates.color !== undefined) label.setColor(...updates.color);
    if (updates.alpha !== undefined) label.setAlpha(updates.alpha);
    if (updates.scale !== undefined) label.setScale(updates.scale);
    if (updates.visible !== undefined) label.visible = updates.visible;
  }
  
  /**
   * Remove a label
   */
  function removeLabel(id) {
    labels.delete(id);
  }
  
  /**
   * Get a label by ID
   */
  function getLabel(id) {
    return labels.get(id);
  }
  
  /**
   * Calculate text width in world units
   */
  function measureText(text, scale = 0.05) {
    let width = 0;
    const fontSize = atlas.config.fontSize;
    
    for (const char of text) {
      const glyph = atlas.glyphs[char] || atlas.glyphs[' '];
      if (glyph) {
        width += glyph.advance;
      }
    }
    
    return (width / fontSize) * scale;
  }
  
  /**
   * Update all labels and build instance buffer
   */
  function update(cameraPos) {
    instanceCount = 0;
    const fontSize = atlas.config.fontSize;
    
    for (const [id, label] of labels) {
      if (!label.visible || label.alpha <= 0) continue;
      
      const text = label.text;
      const pos = label.position;
      const scale = label.scale;
      
      // Calculate text width for centering (normalized units)
      let textWidth = 0;
      for (const char of text) {
        const glyph = atlas.glyphs[char] || atlas.glyphs[' '];
        if (glyph) textWidth += glyph.advance / fontSize;
      }
      
      // Starting offset based on anchor (in normalized units)
      let offsetX = 0;
      if (label.anchor === 'center') offsetX = -textWidth / 2;
      else if (label.anchor === 'right') offsetX = -textWidth;
      
      // Build flags
      let flags = 0;
      if (label.billboard) flags |= 1;
      if (label.outline) flags |= 2;
      
      // Add each character as an instance
      for (const char of text) {
        if (instanceCount >= maxInstances) break;
        
        const glyph = atlas.glyphs[char] || atlas.glyphs[' '];
        if (!glyph) continue;
        
        // Character size in world units (normalized to 1.0 height)
        const charWidth = glyph.width / fontSize;
        const charHeight = glyph.height / fontSize;
        
        const offset = instanceCount * INSTANCE_FLOATS;
        
        // World position
        instanceData[offset + 0] = pos[0];
        instanceData[offset + 1] = pos[1];
        instanceData[offset + 2] = pos[2];
        instanceData[offset + 3] = 0; // charIndex (unused)
        
        // UV rect
        instanceData[offset + 4] = glyph.u;
        instanceData[offset + 5] = glyph.v;
        instanceData[offset + 6] = glyph.uWidth;
        instanceData[offset + 7] = glyph.vHeight;
        
        // Offset from anchor
        instanceData[offset + 8] = offsetX;
        instanceData[offset + 9] = 0;
        
        // Size
        instanceData[offset + 10] = charWidth;
        instanceData[offset + 11] = charHeight;
        
        // Color
        instanceData[offset + 12] = label.color[0];
        instanceData[offset + 13] = label.color[1];
        instanceData[offset + 14] = label.color[2];
        instanceData[offset + 15] = label.color[3] * label.alpha;
        
        // Outline color
        instanceData[offset + 16] = label.outlineColor[0];
        instanceData[offset + 17] = label.outlineColor[1];
        instanceData[offset + 18] = label.outlineColor[2];
        instanceData[offset + 19] = label.outlineColor[3] * label.alpha;
        
        // Flags and scale
        instanceData[offset + 20] = flags;
        instanceData[offset + 21] = scale; // Actual scale value
        instanceData[offset + 22] = 0; // Padding
        instanceData[offset + 23] = 0; // Padding
        
        offsetX += glyph.advance / fontSize;
        instanceCount++;
      }
    }
    
    // Upload to GPU
    if (instanceCount > 0) {
      device.queue.writeBuffer(
        instanceBuffer,
        0,
        instanceData.buffer,
        0,
        instanceCount * INSTANCE_FLOATS * 4
      );
    }
  }
  
  /**
   * Render all text
   */
  function render(pass) {
    if (instanceCount === 0) return;
    
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, instanceCount);
  }
  
  /**
   * Clean up resources
   */
  function destroy() {
    instanceBuffer.destroy();
    atlasTexture.destroy();
    labels.clear();
  }
  
  /**
   * Get debug info
   */
  function getDebugInfo() {
    return {
      labelCount: labels.size,
      instanceCount,
      maxInstances,
      atlasSize: atlas.config.atlasSize,
      glyphCount: Object.keys(atlas.glyphs).length,
    };
  }
  
  return {
    createLabel,
    updateLabel,
    removeLabel,
    getLabel,
    measureText,
    update,
    render,
    destroy,
    getDebugInfo,
    // Access to atlas for custom rendering
    atlas,
    glyphs: atlas.glyphs,
  };
}

// Export shader for external use
export { msdfShader, MSDF_CONFIG };
