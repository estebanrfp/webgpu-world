/**
 * Nameplate System - Canvas2D rendered HUD billboards
 * Renders beautiful nameplates like Orillusion using native Canvas text
 * Each nameplate is a texture rendered with Canvas2D, displayed as a billboard
 */

import { CONFIG } from '../index.js';

// Nameplate Configuration
const NAMEPLATE_CONFIG = {
  maxDistance: 35,
  fadeStartDistance: 25,
  fadeEndDistance: 35,
  minDistance: 2,
  heightOffset: 4.0,  // Above head centered
  // Canvas/texture size (taller for badges + 3 bars with labels)
  canvasWidth: 120,
  canvasHeight: 85,
  // Visual style (Orillusion-like)
  fontSize: 14,
  statusFontSize: 10,
  fontFamily: 'Arial, Helvetica, sans-serif',
  // Smoothing - disabled for instant follow
  smoothFactor: 1.0,
};

/**
 * Nameplate Shader - Simple textured billboard
 */
export const nameplateShader = /* wgsl */`
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

  struct NameplateInstance {
    worldPos: vec3f,
    alpha: f32,
    scale: f32,
    textureIndex: f32,
    _pad0: f32,
    _pad1: f32,
  }

  @group(0) @binding(0) var<uniform> camera: Camera;
  @group(0) @binding(1) var<storage, read> instances: array<NameplateInstance>;
  @group(0) @binding(2) var nameplateTexture: texture_2d_array<f32>;
  @group(0) @binding(3) var nameplateSampler: sampler;

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
    @location(1) alpha: f32,
    @location(2) textureIndex: f32,
  }

  @vertex
  fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
  ) -> VertexOutput {
    var out: VertexOutput;
    
    let inst = instances[instanceIndex];
    
    if (inst.alpha <= 0.0) {
      out.position = vec4f(0.0, 0.0, -10.0, 1.0);
      out.alpha = 0.0;
      return out;
    }
    
    // Quad vertices (billboard facing camera)
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
    
    // Spherical Billboard: fully face camera (visible from all angles including above)
    let toCamera = normalize(camera.position - inst.worldPos);
    let worldUp = vec3f(0.0, 1.0, 0.0);
    let right = normalize(cross(worldUp, toCamera));
    let up = normalize(cross(toCamera, right)); // True perpendicular up for spherical billboard
    
    // Aspect ratio correction (120x85 texture) - compact
    let aspectRatio = 120.0 / 85.0;
    let scale = inst.scale * 0.85;
    let scaledRight = right * localPos.x * scale * aspectRatio;
    let scaledUp = up * localPos.y * scale;
    
    let worldPos = inst.worldPos + scaledRight + scaledUp;
    
    out.position = camera.viewProjection * vec4f(worldPos, 1.0);
    out.alpha = inst.alpha;
    out.textureIndex = inst.textureIndex;
    
    return out;
  }

  @fragment
  fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    if (in.alpha <= 0.0) {
      discard;
    }
    
    let color = textureSample(nameplateTexture, nameplateSampler, in.uv, u32(in.textureIndex));
    
    if (color.a < 0.01) {
      discard;
    }
    
    return vec4f(color.rgb, color.a * in.alpha);
  }
`;

/**
 * Renders a single nameplate to a canvas
 */
function renderNameplateToCanvas(ctx, name, status, accentColor, health, energy, statusIcon) {
  const w = NAMEPLATE_CONFIG.canvasWidth;
  const h = NAMEPLATE_CONFIG.canvasHeight;
  
  // Clear
  ctx.clearRect(0, 0, w, h);
  
  // Background panel with rounded corners
  const margin = 3;
  const panelX = margin;
  const panelY = margin;
  const panelW = w - margin * 2;
  const panelH = h - margin * 2;
  const radius = 3;
  
  // Draw rounded rect background
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, radius);
  ctx.fillStyle = 'rgba(20, 20, 25, 0.85)';
  ctx.fill();
  
  // Top accent bar
  const barHeight = 3;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, barHeight, [radius, radius, 0, 0]);
  ctx.fillStyle = accentColor;
  ctx.fill();
  
  // Status icon (chat indicator circle) - top right corner
  const iconRadius = 5;
  const iconX = panelX + panelW - iconRadius - 4;
  const iconY = panelY + barHeight + iconRadius + 4;
  
  // Icon colors based on state
  let iconColor;
  switch (statusIcon) {
    case 'online': iconColor = '#22dd44'; break;      // Green - online/available
    case 'busy': iconColor = '#dd4422'; break;        // Red - busy
    case 'away': iconColor = '#ddaa22'; break;        // Yellow - away/idle
    case 'offline': iconColor = '#666666'; break;     // Gray - offline
    default: iconColor = accentColor; break;          // Use accent color as default
  }
  
  // Draw icon circle with glow
  ctx.beginPath();
  ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
  ctx.fillStyle = iconColor;
  ctx.fill();
  
  // Inner highlight
  ctx.beginPath();
  ctx.arc(iconX - 1, iconY - 1, iconRadius * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fill();
  
  // Name text (shifted left slightly to make room for icon)
  ctx.font = `bold ${NAMEPLATE_CONFIG.fontSize}px ${NAMEPLATE_CONFIG.fontFamily}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, w / 2 - 5, panelY + barHeight + 10);
  
  // Status text
  ctx.font = `${NAMEPLATE_CONFIG.statusFontSize}px ${NAMEPLATE_CONFIG.fontFamily}`;
  ctx.fillStyle = 'rgba(180, 180, 180, 0.9)';
  ctx.fillText(status, w / 2 - 5, panelY + barHeight + 23);
  
  // Three bars: Health, Energy, Experience
  const barH = 2;
  const barSpacing = 5;
  const barW = panelW - 10;
  const barX = panelX + 5;
  const startY = panelY + panelH - 18;
  
  // Bar 1: Health (red/green)
  const bar1Y = startY;
  ctx.fillStyle = 'rgba(60, 20, 20, 0.9)';
  ctx.beginPath();
  ctx.roundRect(barX, bar1Y, barW, barH, 1);
  ctx.fill();
  
  const healthW = barW * Math.max(0, Math.min(1, health));
  if (healthW > 0) {
    let healthColor;
    if (health > 0.6) {
      healthColor = '#22cc55';
    } else if (health > 0.3) {
      healthColor = '#ddaa22';
    } else {
      healthColor = '#dd3333';
    }
    ctx.fillStyle = healthColor;
    ctx.beginPath();
    ctx.roundRect(barX, bar1Y, healthW, barH, 1);
    ctx.fill();
  }
  
  // Bar 2: Energy (blue)
  const bar2Y = startY + barSpacing;
  ctx.fillStyle = 'rgba(20, 30, 60, 0.9)';
  ctx.beginPath();
  ctx.roundRect(barX, bar2Y, barW, barH, 1);
  ctx.fill();
  
  const energyW = barW * Math.max(0, Math.min(1, energy));
  if (energyW > 0) {
    ctx.fillStyle = '#3399ff';
    ctx.beginPath();
    ctx.roundRect(barX, bar2Y, energyW, barH, 1);
    ctx.fill();
  }
  
  // Bar 3: Experience/Mana (purple)
  const bar3Y = startY + barSpacing * 2;
  ctx.fillStyle = 'rgba(40, 20, 60, 0.9)';
  ctx.beginPath();
  ctx.roundRect(barX, bar3Y, barW, barH, 1);
  ctx.fill();
  
  // Use a random-ish value based on name for variety (or could pass as param)
  const xpValue = 0.3 + (name.charCodeAt(0) % 10) / 14;
  const xpW = barW * Math.max(0, Math.min(1, xpValue));
  if (xpW > 0) {
    ctx.fillStyle = '#aa55dd';
    ctx.beginPath();
    ctx.roundRect(barX, bar3Y, xpW, barH, 1);
    ctx.fill();
  }
}

/**
 * Renders a single nameplate to a canvas - ANIMATED version with separate bar values
 */
function renderNameplateToCanvasAnimated(ctx, name, status, accentColor, health, energy, xp, statusIcon) {
  const w = NAMEPLATE_CONFIG.canvasWidth;
  const h = NAMEPLATE_CONFIG.canvasHeight;
  
  // Clear
  ctx.clearRect(0, 0, w, h);
  
  // Background panel with rounded corners
  const margin = 3;
  const panelX = margin;
  const panelY = margin;
  const panelW = w - margin * 2;
  const panelH = h - margin * 2;
  const radius = 3;
  
  // Draw rounded rect background
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, radius);
  ctx.fillStyle = 'rgba(20, 20, 25, 0.85)';
  ctx.fill();
  
  // Top accent bar
  const barHeight = 3;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, barHeight, [radius, radius, 0, 0]);
  ctx.fillStyle = accentColor;
  ctx.fill();
  
  // Status icon (chat indicator circle) - top right corner
  const iconRadius = 5;
  const iconX = panelX + panelW - iconRadius - 4;
  const iconY = panelY + barHeight + iconRadius + 4;
  
  // Icon colors based on state
  let iconColor;
  switch (statusIcon) {
    case 'online': iconColor = '#22dd44'; break;
    case 'busy': iconColor = '#dd4422'; break;
    case 'away': iconColor = '#ddaa22'; break;
    case 'offline': iconColor = '#666666'; break;
    default: iconColor = accentColor; break;
  }
  
  // Draw icon circle with glow
  ctx.beginPath();
  ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
  ctx.fillStyle = iconColor;
  ctx.fill();
  
  // Inner highlight
  ctx.beginPath();
  ctx.arc(iconX - 1, iconY - 1, iconRadius * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fill();
  
  // Name text
  ctx.font = `bold ${NAMEPLATE_CONFIG.fontSize}px ${NAMEPLATE_CONFIG.fontFamily}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, w / 2 - 5, panelY + barHeight + 10);
  
  // Status text
  ctx.font = `${NAMEPLATE_CONFIG.statusFontSize}px ${NAMEPLATE_CONFIG.fontFamily}`;
  ctx.fillStyle = 'rgba(180, 180, 180, 0.9)';
  ctx.fillText(status, w / 2 - 5, panelY + barHeight + 21);
  
  // Achievement badges row (emojis as trophies)
  const badges = ['🏆', '⭐', '🎯', '💎', '🔥', '🎖️'];
  // Show different number of badges based on entity (simulated achievements) - max 6
  const badgeCount = 1 + (name.charCodeAt(0) % 6); // 1-6 badges based on name
  const badgeY = panelY + barHeight + 33;
  const badgeSpacing = 16;
  const totalBadgeWidth = badgeCount * badgeSpacing;
  const badgeStartX = (w - totalBadgeWidth) / 2 + badgeSpacing / 2;
  
  ctx.font = '12px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < badgeCount; i++) {
    ctx.fillText(badges[i % badges.length], badgeStartX + i * badgeSpacing, badgeY);
  }
  
  // Three bars: Health, Energy, Experience
  const barH = 2;
  const barSpacing = 7;
  const labelWidth = 16; // Space for labels
  const barW = panelW - 10 - labelWidth;
  const barX = panelX + 5 + labelWidth;
  const startY = panelY + panelH - 24;
  
  // Bar labels style
  ctx.font = `bold 7px ${NAMEPLATE_CONFIG.fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  // Bar 1: Health (red/green)
  const bar1Y = startY;
  ctx.fillStyle = '#88cc88';
  ctx.fillText('HP', panelX + 5, bar1Y + barH / 2 + 1);
  
  ctx.fillStyle = 'rgba(60, 20, 20, 0.9)';
  ctx.beginPath();
  ctx.roundRect(barX, bar1Y, barW, barH, 1);
  ctx.fill();
  
  const healthW = barW * Math.max(0, Math.min(1, health));
  if (healthW > 0) {
    let healthColor;
    if (health > 0.6) {
      healthColor = '#22cc55';
    } else if (health > 0.3) {
      healthColor = '#ddaa22';
    } else {
      healthColor = '#dd3333';
    }
    ctx.fillStyle = healthColor;
    ctx.beginPath();
    ctx.roundRect(barX, bar1Y, healthW, barH, 1);
    ctx.fill();
  }
  
  // Bar 2: Energy (blue)
  const bar2Y = startY + barSpacing;
  ctx.fillStyle = '#88aaff';
  ctx.fillText('EN', panelX + 5, bar2Y + barH / 2 + 1);
  
  ctx.fillStyle = 'rgba(20, 30, 60, 0.9)';
  ctx.beginPath();
  ctx.roundRect(barX, bar2Y, barW, barH, 1);
  ctx.fill();
  
  const energyW = barW * Math.max(0, Math.min(1, energy));
  if (energyW > 0) {
    ctx.fillStyle = '#3399ff';
    ctx.beginPath();
    ctx.roundRect(barX, bar2Y, energyW, barH, 1);
    ctx.fill();
  }
  
  // Bar 3: Experience/Mana (purple)
  const bar3Y = startY + barSpacing * 2;
  ctx.fillStyle = '#cc88dd';
  ctx.fillText('XP', panelX + 5, bar3Y + barH / 2 + 1);
  
  ctx.fillStyle = 'rgba(40, 20, 60, 0.9)';
  ctx.beginPath();
  ctx.roundRect(barX, bar3Y, barW, barH, 1);
  ctx.fill();
  
  const xpW = barW * Math.max(0, Math.min(1, xp));
  if (xpW > 0) {
    ctx.fillStyle = '#aa55dd';
    ctx.beginPath();
    ctx.roundRect(barX, bar3Y, xpW, barH, 1);
    ctx.fill();
  }
}

/**
 * Creates the Nameplate system
 */
export function createNameplateSystem(device, options = {}) {
  const {
    cameraBuffer,
    maxInstances = 150,
  } = options;

  // Track entities and their texture indices
  const entityTextures = new Map(); // entityKey -> textureIndex
  let nextTextureIndex = 0;
  
  // Smoothed Y positions
  const smoothedY = new Map();
  
  // Canvas for rendering nameplates
  const canvas = document.createElement('canvas');
  canvas.width = NAMEPLATE_CONFIG.canvasWidth;
  canvas.height = NAMEPLATE_CONFIG.canvasHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  // Create texture array for all nameplates
  const textureArray = device.createTexture({
    size: [NAMEPLATE_CONFIG.canvasWidth, NAMEPLATE_CONFIG.canvasHeight, maxInstances],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    label: 'Nameplate Texture Array',
  });
  
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  
  // Instance buffer (8 floats per instance)
  const INSTANCE_FLOATS = 8;
  const instanceData = new Float32Array(maxInstances * INSTANCE_FLOATS);
  let instanceCount = 0;
  
  const instanceBuffer = device.createBuffer({
    size: maxInstances * INSTANCE_FLOATS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Nameplate Instance Buffer',
  });
  
  // Shader and pipeline
  const shaderModule = device.createShaderModule({
    code: nameplateShader,
    label: 'Nameplate Shader',
  });
  
  const pipeline = device.createRenderPipeline({
    label: 'Nameplate Pipeline',
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
      depthCompare: 'always', // UI always visible
    },
  });
  
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: instanceBuffer } },
      { binding: 2, resource: textureArray.createView() },
      { binding: 3, resource: sampler },
    ],
    label: 'Nameplate Bind Group',
  });
  
  // State formatting
  function formatState(state) {
    switch (state) {
      case 'idle': return 'Quieto';
      case 'walking': return 'Caminando';
      case 'running': return 'Corriendo';
      case 'following': return 'Siguiendo';
      default: return state || '';
    }
  }
  
  // Get or create texture for entity
  function getOrCreateTexture(entityKey, name, status, accentColor, health, statusIcon) {
    if (!entityTextures.has(entityKey)) {
      if (nextTextureIndex >= maxInstances) {
        console.warn('Max nameplate textures reached');
        return 0;
      }
      entityTextures.set(entityKey, {
        index: nextTextureIndex++,
        lastName: null,
        lastStatus: null,
        lastHealth: null,
        lastIcon: null,
      });
    }
    
    const entry = entityTextures.get(entityKey);
    
    // Check if we need to re-render
    const healthBucket = Math.floor(health * 10); // Only update on significant health change
    if (entry.lastName !== name || entry.lastStatus !== status || entry.lastHealth !== healthBucket || entry.lastIcon !== statusIcon) {
      entry.lastName = name;
      entry.lastStatus = status;
      entry.lastHealth = healthBucket;
      entry.lastIcon = statusIcon;
      
      // Render to canvas
      renderNameplateToCanvas(ctx, name, status, accentColor, health, 1.0, statusIcon);
      
      // Upload to texture array
      const imageData = ctx.getImageData(0, 0, NAMEPLATE_CONFIG.canvasWidth, NAMEPLATE_CONFIG.canvasHeight);
      device.queue.writeTexture(
        { texture: textureArray, origin: [0, 0, entry.index] },
        imageData.data,
        { bytesPerRow: NAMEPLATE_CONFIG.canvasWidth * 4 },
        [NAMEPLATE_CONFIG.canvasWidth, NAMEPLATE_CONFIG.canvasHeight, 1]
      );
    }
    
    return entry.index;
  }
  
  // Get or create texture for entity - ANIMATED version (re-renders every frame)
  function getOrCreateTextureAnimated(entityKey, name, status, accentColor, health, energy, xp, statusIcon) {
    if (!entityTextures.has(entityKey)) {
      if (nextTextureIndex >= maxInstances) {
        console.warn('Max nameplate textures reached');
        return 0;
      }
      entityTextures.set(entityKey, {
        index: nextTextureIndex++,
      });
    }
    
    const entry = entityTextures.get(entityKey);
    
    // Always re-render for animation
    renderNameplateToCanvasAnimated(ctx, name, status, accentColor, health, energy, xp, statusIcon);
    
    // Upload to texture array
    const imageData = ctx.getImageData(0, 0, NAMEPLATE_CONFIG.canvasWidth, NAMEPLATE_CONFIG.canvasHeight);
    device.queue.writeTexture(
      { texture: textureArray, origin: [0, 0, entry.index] },
      imageData.data,
      { bytesPerRow: NAMEPLATE_CONFIG.canvasWidth * 4 },
      [NAMEPLATE_CONFIG.canvasWidth, NAMEPLATE_CONFIG.canvasHeight, 1]
    );
    
    return entry.index;
  }
  
  // Calculate visibility
  function calculateVisibility(entityPos, cameraPos) {
    const dx = entityPos[0] - cameraPos[0];
    const dy = entityPos[1] - cameraPos[1];
    const dz = entityPos[2] - cameraPos[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (distance > NAMEPLATE_CONFIG.maxDistance) {
      return { alpha: 0, scale: 0, visible: false };
    }
    
    let alpha = 1.0;
    if (distance > NAMEPLATE_CONFIG.fadeStartDistance) {
      alpha = 1.0 - (distance - NAMEPLATE_CONFIG.fadeStartDistance) / 
              (NAMEPLATE_CONFIG.fadeEndDistance - NAMEPLATE_CONFIG.fadeStartDistance);
    }
    if (distance < NAMEPLATE_CONFIG.minDistance) {
      alpha *= distance / NAMEPLATE_CONFIG.minDistance;
    }
    
    const distanceFactor = Math.max(0, 1 - distance / NAMEPLATE_CONFIG.maxDistance);
    const scale = 0.3 + 0.5 * distanceFactor;
    
    return {
      alpha: Math.max(0, Math.min(1, alpha)),
      scale,
      visible: alpha > 0.01,
    };
  }
  
  /**
   * Update all nameplates
   */
  function update(entities, cameraPos, time = performance.now()) {
    instanceCount = 0;
    
    for (let i = 0; i < entities.length && instanceCount < maxInstances; i++) {
      const entity = entities[i];
      if (!entity) continue;
      
      const entityPos = [entity.x || 0, entity.y || 0, entity.z || 0];
      const vis = calculateVisibility(entityPos, cameraPos);
      
      if (!vis.visible) continue;
      
      // Smooth Y position
      const entityKey = entity.id ?? `entity_${i}`;
      let targetY = entityPos[1] + NAMEPLATE_CONFIG.heightOffset;
      let currentY = smoothedY.get(entityKey);
      if (currentY === undefined) {
        currentY = targetY;
      } else {
        currentY = currentY + (targetY - currentY) * NAMEPLATE_CONFIG.smoothFactor;
      }
      smoothedY.set(entityKey, currentY);
      
      // Get nameplate info
      const name = entity.name || (i === 0 ? 'Player' : `NPC ${i}`);
      const status = formatState(entity.state);
      const accentColor = entity.color || (i === 0 ? '#4ff3ff' : '#ff6644');
      
      // Animated bars - each entity has different phase based on index
      const phase = i * 0.7; // Different starting phase per entity
      const speed1 = 0.0008 + (i % 5) * 0.0001; // Health bar speed varies
      const speed2 = 0.0012 + (i % 7) * 0.00015; // Energy bar speed varies  
      const speed3 = 0.0006 + (i % 3) * 0.0002; // XP bar speed varies
      
      const health = (Math.sin(time * speed1 + phase) + 1) / 2; // 0 to 1 animated
      const energy = (Math.sin(time * speed2 + phase + 1) + 1) / 2;
      const xp = (Math.sin(time * speed3 + phase + 2) + 1) / 2;
      
      // Determine status icon based on entity state
      let statusIcon;
      if (entity.statusIcon) {
        statusIcon = entity.statusIcon;
      } else {
        // Auto-determine based on state
        switch (entity.state) {
          case 'idle': statusIcon = 'online'; break;
          case 'walking': statusIcon = 'away'; break;
          case 'running': statusIcon = 'busy'; break;
          default: statusIcon = 'online';
        }
      }
      
      // Get/update texture - pass animated values
      const textureIndex = getOrCreateTextureAnimated(entityKey, name, status, accentColor, health, energy, xp, statusIcon);
      
      // Write instance data
      const offset = instanceCount * INSTANCE_FLOATS;
      instanceData[offset + 0] = entityPos[0];     // worldPos.x
      instanceData[offset + 1] = currentY;          // worldPos.y (smoothed)
      instanceData[offset + 2] = entityPos[2];     // worldPos.z
      instanceData[offset + 3] = vis.alpha;         // alpha
      instanceData[offset + 4] = vis.scale;         // scale
      instanceData[offset + 5] = textureIndex;      // textureIndex
      instanceData[offset + 6] = 0;                 // padding
      instanceData[offset + 7] = 0;                 // padding
      
      instanceCount++;
    }
    
    // Upload instances
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
   * Render all nameplates
   */
  function render(pass) {
    if (instanceCount === 0) return;
    
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, instanceCount);
  }
  
  function destroy() {
    instanceBuffer.destroy();
    textureArray.destroy();
  }
  
  return {
    update,
    render,
    destroy,
    get instanceCount() { return instanceCount; },
  };
}

export { NAMEPLATE_CONFIG };
