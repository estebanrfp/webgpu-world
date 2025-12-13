/**
 * HUD System - Billboard nameplates that always face the camera
 * Features: LOD, distance-based fade, smooth transitions
 */

import { CONFIG } from '../index.js';

// HUD Configuration
const HUD_CONFIG = {
  maxDistance: 30,           // Max distance to show HUD
  fadeStartDistance: 20,     // Start fading at this distance
  fadeEndDistance: 30,       // Fully invisible at this distance
  minDistance: 3,            // Min distance (too close = fade out)
  heightOffset: 4.2,         // Height above character (well above head)
  baseScale: 0.8,            // Base scale of HUD
  minScale: 0.3,             // Minimum scale at far distance
  updateInterval: 50,        // Update every N ms (LOD optimization)
};

/**
 * HUD Shader - Billboard quads that always face camera
 */
export const hudShader = /* wgsl */`
  // Camera struct matching the actual uniform buffer (112 bytes)
  struct Camera {
    viewProjection: mat4x4f,  // 64 bytes
    position: vec3f,          // 12 bytes
    time: f32,                // 4 bytes
    cloudCoverage: f32,       // 4 bytes
    starBlur: f32,            // 4 bytes
    skyDarkening: f32,        // 4 bytes
    lightningFlash: f32,      // 4 bytes
    lightningPosX: f32,       // 4 bytes
    lightningPosY: f32,       // 4 bytes
    dayTime: f32,             // 4 bytes
    // Total: 112 bytes
  }

  struct HUDInstance {
    worldPos: vec3f,      // World position of HUD
    alpha: f32,           // Opacity (0-1)
    scale: f32,           // Scale factor
    health: f32,          // Health bar (0-1)
    energy: f32,          // Energy bar (0-1)
    state: f32,           // State indicator (0=idle, 1=walking, 2=running, 3=following)
    tint: vec3f,          // Accent color (RGB 0-1)
  }

  @group(0) @binding(0) var<uniform> camera: Camera;
  @group(0) @binding(1) var<storage, read> instances: array<HUDInstance>;

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
    @location(1) alpha: f32,
    @location(2) health: f32,
    @location(3) energy: f32,
    @location(4) state: f32,
    @location(5) instanceId: f32,
    @location(6) tint: vec3f,
  }

  @vertex
  fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
  ) -> VertexOutput {
    var out: VertexOutput;
    
    let instance = instances[instanceIndex];
    
    // Skip if alpha is 0 (LOD culling)
    if (instance.alpha <= 0.0) {
      out.position = vec4f(0.0, 0.0, -10.0, 1.0); // Behind camera
      out.alpha = 0.0;
      return out;
    }
    
    // Quad vertices (two triangles)
    var positions = array<vec2f, 6>(
      vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5),
      vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(-0.5, 0.5)
    );
    var uvs = array<vec2f, 6>(
      vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
      vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
    );
    
    let localPos = positions[vertexIndex];
    out.uv = uvs[vertexIndex];
    
    // Billboard: face camera using camera position
    let toCamera = normalize(camera.position - instance.worldPos);
    let worldUp = vec3f(0.0, 1.0, 0.0);
    let right = normalize(cross(worldUp, toCamera));
    let up = worldUp; // Keep HUD upright
    
    // Scale the billboard
    let scale = instance.scale * 1.5; // Aspect ratio adjustment
    let scaledRight = right * localPos.x * scale;
    let scaledUp = up * localPos.y * scale * 0.5; // Shorter height
    
    // World position with billboard offset
    let worldPos = instance.worldPos + scaledRight + scaledUp;
    
    // Transform to clip space using viewProjection
    out.position = camera.viewProjection * vec4f(worldPos, 1.0);
    out.alpha = instance.alpha;
    out.health = instance.health;
    out.energy = instance.energy;
    out.state = instance.state;
    out.instanceId = f32(instanceIndex);
    out.tint = instance.tint;
    
    return out;
  }

  @fragment
  fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    if (in.alpha <= 0.0) {
      discard;
    }
    
    let uv = in.uv;
    
    // Orillusion-like layout (procedural):
    // - Background panel
    // - Top accent bar (entity color)
    // - Bottom health bar
    
    var color = vec4f(0.0);
    
    // Panel bounds
    let marginX = 0.08;
    let topY = 0.18;
    let bottomY = 0.82;

    let inPanel = uv.x > marginX && uv.x < (1.0 - marginX) && uv.y > topY && uv.y < bottomY;
    if (inPanel) {
      // Background
      color = vec4f(0.08, 0.08, 0.08, 0.78);

      // Subtle border
      let border = 0.018;
      let onBorder = uv.x < (marginX + border) || uv.x > (1.0 - marginX - border) || uv.y < (topY + border) || uv.y > (bottomY - border);
      if (onBorder) {
        color = vec4f(0.25, 0.25, 0.25, 0.85);
      }

      // Top accent bar
      let barTopH = 0.06;
      let inTopBar = uv.y > topY && uv.y < (topY + barTopH) && uv.x > marginX && uv.x < (1.0 - marginX);
      if (inTopBar) {
        color = vec4f(in.tint, 1.0);
      }

      // Health bar (bottom)
      let healthY0 = bottomY - 0.12;
      let healthY1 = bottomY - 0.06;
      let inHealth = uv.y > healthY0 && uv.y < healthY1;
      let barX = (uv.x - (marginX + 0.04)) / (1.0 - 2.0 * (marginX + 0.04));
      if (inHealth && barX >= 0.0 && barX <= 1.0) {
        // Background of the bar
        color = vec4f(0.30, 0.00, 0.00, 0.95);
        if (barX <= in.health) {
          let healthColor = mix(vec3f(0.0, 0.8, 0.2), vec3f(0.9, 0.1, 0.1), 1.0 - in.health);
          color = vec4f(healthColor, 0.98);
        }
      }
    }
    
    // Apply alpha fade
    color.a *= in.alpha;
    
    // Discard fully transparent pixels
    if (color.a < 0.01) {
      discard;
    }
    
    return color;
  }
`;

/**
 * Creates the HUD system for character nameplates
 * @param {GPUDevice} device - WebGPU device
 * @param {Object} options - Configuration options
 * @returns {Object} HUD system with state and methods
 */
export function createHUDSystem(device, options = {}) {
  const {
    cameraBuffer,
    maxInstances = 100,
  } = options;

  // Instance data storage (CPU side)
  const instanceData = new Float32Array(maxInstances * 12); // 12 floats per instance
  let instanceCount = 0;
  let lastUpdateTime = 0;

  // Smoothed Y positions to avoid vibration during walk animation
  const smoothedY = new Map(); // key: entity index, value: smoothed Y
  const SMOOTH_FACTOR = 0.15; // Lower = smoother but more lag

  // Create storage buffer for instances
  const instanceBuffer = device.createBuffer({
    size: maxInstances * 12 * 4, // 12 floats * 4 bytes
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'HUD Instance Buffer',
  });

  // Create shader module
  const shaderModule = device.createShaderModule({
    code: hudShader,
    label: 'HUD Shader',
  });

  // Create pipeline
  const pipeline = device.createRenderPipeline({
    label: 'HUD Pipeline',
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
      cullMode: 'none', // Billboards need to be visible from both sides
    },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: false, // Don't write to depth (transparent)
      // UI-like behavior: never get occluded by world geometry
      depthCompare: 'always',
    },
  });

  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: instanceBuffer } },
    ],
    label: 'HUD Bind Group',
  });

  /**
   * Calculate HUD visibility and properties based on distance
   */
  function calculateHUDProperties(characterPos, cameraPos) {
    const dx = characterPos[0] - cameraPos[0];
    const dy = characterPos[1] - cameraPos[1];
    const dz = characterPos[2] - cameraPos[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // LOD: completely invisible if too far
    if (distance > HUD_CONFIG.maxDistance) {
      return { alpha: 0, scale: 0, visible: false };
    }

    // Fade in/out based on distance
    let alpha = 1.0;

    // Fade out at far distance
    if (distance > HUD_CONFIG.fadeStartDistance) {
      alpha = 1.0 - (distance - HUD_CONFIG.fadeStartDistance) / 
              (HUD_CONFIG.fadeEndDistance - HUD_CONFIG.fadeStartDistance);
    }

    // Fade out if too close
    if (distance < HUD_CONFIG.minDistance) {
      alpha *= distance / HUD_CONFIG.minDistance;
    }

    // Scale based on distance (smaller when far)
    const distanceFactor = Math.max(0, 1 - distance / HUD_CONFIG.maxDistance);
    const scale = HUD_CONFIG.minScale + 
                  (HUD_CONFIG.baseScale - HUD_CONFIG.minScale) * distanceFactor;

    return {
      alpha: Math.max(0, Math.min(1, alpha)),
      scale,
      visible: alpha > 0.01,
    };
  }

  /**
   * Convert NPC state to numeric value for shader
   */
  function stateToNumber(state) {
    switch (state) {
      case 'idle': return 0;
      case 'walking': return 1;
      case 'running': return 2;
      case 'following': return 3;
      default: return 0;
    }
  }

  /**
   * Update HUD instances for all characters
   * @param {Array} characters - Array of character objects with position, health, etc.
   * @param {Array} cameraPos - Camera position [x, y, z]
   * @param {number} time - Current time for animations
   */
  function update(characters, cameraPos, time) {
    // LOD: limit update frequency
    if (time - lastUpdateTime < HUD_CONFIG.updateInterval) {
      return;
    }
    lastUpdateTime = time;

    instanceCount = 0;

    for (let i = 0; i < characters.length && instanceCount < maxInstances; i++) {
      const char = characters[i];
      if (!char) continue;

      const charPos = [char.x || 0, char.y || 0, char.z || 0];
      const hudProps = calculateHUDProperties(charPos, cameraPos);

      if (!hudProps.visible) continue;

      // Smooth the Y position to avoid vibration during walk animation
      const entityKey = char.id ?? i; // Use entity id or index as key
      let targetY = charPos[1] + HUD_CONFIG.heightOffset;
      let currentSmoothedY = smoothedY.get(entityKey);
      if (currentSmoothedY === undefined) {
        currentSmoothedY = targetY; // Initialize on first frame
      } else {
        // Lerp towards target (smooth out small oscillations)
        currentSmoothedY = currentSmoothedY + (targetY - currentSmoothedY) * SMOOTH_FACTOR;
      }
      smoothedY.set(entityKey, currentSmoothedY);

      // HUD position (above character, with smoothed Y)
      const hudPos = [
        charPos[0],
        currentSmoothedY,
        charPos[2],
      ];

      // Accent color (top bar)
      let cr = 1.0;
      let cg = 1.0;
      let cb = 1.0;
      if (typeof char.color === 'string' && char.color.length === 7 && char.color[0] === '#') {
        cr = parseInt(char.color.slice(1, 3), 16) / 255;
        cg = parseInt(char.color.slice(3, 5), 16) / 255;
        cb = parseInt(char.color.slice(5, 7), 16) / 255;
      } else if (Array.isArray(char.color) && char.color.length >= 3) {
        cr = char.color[0];
        cg = char.color[1];
        cb = char.color[2];
      }

      // Write instance data (12 floats per instance)
      const offset = instanceCount * 12;
      instanceData[offset + 0] = hudPos[0];                    // worldPos.x
      instanceData[offset + 1] = hudPos[1];                    // worldPos.y
      instanceData[offset + 2] = hudPos[2];                    // worldPos.z
      instanceData[offset + 3] = hudProps.alpha;               // alpha
      instanceData[offset + 4] = hudProps.scale;               // scale
      instanceData[offset + 5] = char.health ?? 1.0;           // health
      instanceData[offset + 6] = char.energy ?? 1.0;           // energy
      instanceData[offset + 7] = stateToNumber(char.state);    // state

      instanceData[offset + 8] = cr;                            // tint.r
      instanceData[offset + 9] = cg;                            // tint.g
      instanceData[offset + 10] = cb;                           // tint.b
      instanceData[offset + 11] = 0.0;                          // padding

      instanceCount++;
    }

    // Upload to GPU
    if (instanceCount > 0) {
      device.queue.writeBuffer(
        instanceBuffer,
        0,
        instanceData.buffer,
        0,
        instanceCount * 12 * 4
      );
    }
  }

  /**
   * Render all visible HUDs
   * @param {GPURenderPassEncoder} pass - Render pass encoder
   */
  function render(pass) {
    if (instanceCount === 0) return;

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, instanceCount); // 6 vertices per quad, instanceCount quads
  }

  /**
   * Cleanup resources
   */
  function destroy() {
    instanceBuffer.destroy();
    placeholderTexture.destroy();
  }

  return {
    update,
    render,
    destroy,
    getInstanceCount: () => instanceCount,
    config: HUD_CONFIG,
  };
}
