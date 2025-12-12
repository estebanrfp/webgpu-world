/**
 * ========================================
 * KTX2 Texture Loader with Basis Transcoder
 * ========================================
 * Loads KTX2 textures with Basis Universal compression support
 */

// Basis Universal transcoder state
let basisTranscoderReady = false;
let basisTranscoderFailed = false;
let basisInitPromise = null;
let BasisModule = null;

// Format mappings
const VK_FORMAT_TO_GPU = {
  37: 'rgba8unorm',      // VK_FORMAT_R8G8B8A8_UNORM
  43: 'rgba8unorm-srgb', // VK_FORMAT_R8G8B8A8_SRGB
  131: 'bc1-rgba-unorm',
  132: 'bc1-rgba-unorm-srgb',
  135: 'bc3-rgba-unorm',
  136: 'bc3-rgba-unorm-srgb',
  145: 'bc7-rgba-unorm',
  146: 'bc7-rgba-unorm-srgb',
  157: 'astc-4x4-unorm',
  158: 'astc-4x4-unorm-srgb',
  147: 'etc2-rgb8unorm',
  151: 'etc2-rgba8unorm',
};

const BASIS_FORMAT_TO_GPU = {
  'BC1': 'bc1-rgba-unorm',
  'BC3': 'bc3-rgba-unorm',
  'BC7': 'bc7-rgba-unorm',
  'ASTC_4x4': 'astc-4x4-unorm',
  'ETC2_RGB': 'etc2-rgb8unorm',
  'ETC2_RGBA': 'etc2-rgba8unorm',
  'RGBA32': 'rgba8unorm',
};

// Basis format enum values
const BASIS_FORMAT_VALUES = {
  'BC1': 1,       // cTFBC1_RGB
  'BC3': 3,       // cTFBC3_RGBA  
  'BC7': 6,       // cTFBC7_RGBA
  'ASTC_4x4': 10, // cTFASTC_4x4_RGBA
  'ETC2_RGB': 22, // cTFETC2_EAC_R11
  'ETC2_RGBA': 2, // cTFETC2_RGBA
  'RGBA32': 13,   // cTFRGBA32
};

/**
 * Check if URL is a KTX2 file
 */
export function isKTX2(url) {
  return url.toLowerCase().endsWith('.ktx2');
}

/**
 * Initialize Basis transcoder
 */
export async function initBasisTranscoder() {
  if (basisTranscoderReady) return true;
  if (basisTranscoderFailed) return false;
  if (basisInitPromise) return basisInitPromise;
  
  basisInitPromise = (async () => {
    try {
      // The script should be loaded from CDN in index.html
      if (typeof BASIS !== 'undefined') {
        BasisModule = await BASIS({
          wasmBinary: await fetch('./assets/wasm/basis_transcoder.wasm')
            .then(r => r.arrayBuffer())
        });
        BasisModule.initializeBasis();
        basisTranscoderReady = true;
        console.log('✅ Basis transcoder initialized');
        return true;
      }
      basisTranscoderFailed = true;
      return false;
    } catch (e) {
      console.warn('⚠️ Could not initialize Basis transcoder:', e.message);
      basisTranscoderFailed = true;
      return false;
    }
  })();
  
  return basisInitPromise;
}

/**
 * Select best transcode format based on device capabilities
 */
function selectTranscodeFormat(device, hasAlpha) {
  if (device.features.has('texture-compression-bc')) {
    return hasAlpha ? 'BC3' : 'BC1';
  }
  if (device.features.has('texture-compression-astc')) {
    return 'ASTC_4x4';
  }
  if (device.features.has('texture-compression-etc2')) {
    return hasAlpha ? 'ETC2_RGBA' : 'ETC2_RGB';
  }
  return 'RGBA32'; // Fallback without compression
}

/**
 * Load KTX2 texture with Basis support
 * @param {GPUDevice} device 
 * @param {string} url 
 * @returns {Promise<GPUTexture>}
 */
export async function loadKTX2Texture(device, url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load: ${url}`);
  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  
  // Verify KTX2 magic number
  const magic = [0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 12; i++) {
    if (data[i] !== magic[i]) throw new Error('Invalid KTX2 file');
  }
  
  // Parse KTX2 header
  const view = new DataView(buffer);
  const vkFormat = view.getUint32(12, true);
  const pixelWidth = view.getUint32(20, true);
  const pixelHeight = view.getUint32(24, true);
  const levelCount = Math.max(1, view.getUint32(36, true));
  const supercompressionScheme = view.getUint32(40, true);
  
  // If Basis compressed (supercompressionScheme=1) or Basis format (vkFormat=0)
  if (supercompressionScheme === 1 || vkFormat === 0) {
    return await loadKTX2WithBasis(device, url, data, buffer, pixelWidth, pixelHeight, levelCount);
  }
  
  // No Basis compression - load directly
  const format = VK_FORMAT_TO_GPU[vkFormat];
  if (!format) throw new Error(`Unsupported vkFormat: ${vkFormat}`);
  
  // Read level index
  const levelIndexOffset = 80;
  const levels = [];
  for (let i = 0; i < levelCount; i++) {
    const byteOffset = Number(view.getBigUint64(levelIndexOffset + i * 24, true));
    const byteLength = Number(view.getBigUint64(levelIndexOffset + i * 24 + 8, true));
    levels.push({ byteOffset, byteLength });
  }
  
  // Create texture
  const texture = device.createTexture({
    size: [pixelWidth, pixelHeight, 1],
    format,
    mipLevelCount: levelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  
  // Write each mipmap level
  for (let level = 0; level < levelCount; level++) {
    const mipWidth = Math.max(1, pixelWidth >> level);
    const mipHeight = Math.max(1, pixelHeight >> level);
    const levelData = data.slice(levels[level].byteOffset, levels[level].byteOffset + levels[level].byteLength);
    
    const blockSize = format.startsWith('bc') || format.startsWith('astc') || format.startsWith('etc') ? 4 : 1;
    const blocksWide = Math.ceil(mipWidth / blockSize);
    const bytesPerBlock = format.includes('bc1') || format.includes('etc2-rgb') ? 8 : 
                          format === 'rgba8unorm' || format === 'rgba8unorm-srgb' ? 4 : 16;
    const bytesPerRow = blocksWide * bytesPerBlock;
    
    device.queue.writeTexture(
      { texture, mipLevel: level },
      levelData,
      { bytesPerRow, rowsPerImage: mipHeight },
      [mipWidth, mipHeight, 1]
    );
  }
  
  console.log(`✅ Loaded KTX2: ${url} (${pixelWidth}x${pixelHeight}, ${levelCount} mips, ${format})`);
  return texture;
}

/**
 * Load KTX2 with Basis compression using transcoder
 */
async function loadKTX2WithBasis(device, url, data, buffer, pixelWidth, pixelHeight, levelCount) {
  // Initialize transcoder if not ready
  await initBasisTranscoder();
  
  if (!basisTranscoderReady || !BasisModule) {
    throw new Error('Basis transcoder not available - cannot decode BasisLZ compressed KTX2');
  }
  
  // Create KTX2 object from buffer
  const ktx2File = new BasisModule.KTX2File(data);
  
  if (!ktx2File.isValid()) {
    ktx2File.close();
    ktx2File.delete();
    throw new Error('Invalid KTX2 file for Basis transcoder');
  }
  
  const width = ktx2File.getWidth();
  const height = ktx2File.getHeight();
  const levels = ktx2File.getLevels();
  const hasAlpha = ktx2File.getHasAlpha();
  
  // Select transcode format based on device capabilities
  const transcodeFormatName = selectTranscodeFormat(device, hasAlpha);
  const transcodeFormat = BASIS_FORMAT_VALUES[transcodeFormatName] ?? 13; // Default RGBA32
  
  console.log(`🔄 Transcoding to: ${transcodeFormatName} (format value: ${transcodeFormat})`);
  
  // Prepare transcoding
  if (!ktx2File.startTranscoding()) {
    ktx2File.close();
    ktx2File.delete();
    throw new Error('Failed to start Basis transcoding');
  }
  
  const gpuFormat = BASIS_FORMAT_TO_GPU[transcodeFormatName] || 'rgba8unorm';
  
  // Create texture
  const texture = device.createTexture({
    size: [width, height, 1],
    format: gpuFormat,
    mipLevelCount: levels,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  
  // Transcode and upload each level
  for (let level = 0; level < levels; level++) {
    const mipWidth = Math.max(1, width >> level);
    const mipHeight = Math.max(1, height >> level);
    
    const dstSize = ktx2File.getImageTranscodedSizeInBytes(level, 0, 0, transcodeFormat);
    const dst = new Uint8Array(dstSize);
    
    if (!ktx2File.transcodeImage(dst, level, 0, 0, transcodeFormat, 0, -1, -1)) {
      console.warn(`Failed to transcode level ${level}`);
      continue;
    }
    
    // For compressed formats (BC, ASTC, ETC), data is in 4x4 blocks
    const isCompressed = gpuFormat.startsWith('bc') || gpuFormat.startsWith('astc') || gpuFormat.startsWith('etc');
    
    if (isCompressed) {
      // BC1 = 8 bytes/block, BC3/BC7 = 16 bytes/block
      const bytesPerBlock = gpuFormat.includes('bc1') ? 8 : 16;
      const blocksWide = Math.ceil(mipWidth / 4);
      const bytesPerRow = blocksWide * bytesPerBlock;
      
      device.queue.writeTexture(
        { texture, mipLevel: level },
        dst,
        { bytesPerRow },
        [Math.max(4, mipWidth), Math.max(4, mipHeight), 1]  // BC minimum 4x4
      );
    } else {
      // RGBA32 without compression
      const bytesPerRow = mipWidth * 4;
      device.queue.writeTexture(
        { texture, mipLevel: level },
        dst,
        { bytesPerRow },
        [mipWidth, mipHeight, 1]
      );
    }
  }
  
  ktx2File.close();
  ktx2File.delete();
  
  console.log(`✅ Loaded KTX2 (Basis): ${url} (${width}x${height}, ${levels} mips, ${gpuFormat})`);
  return texture;
}
