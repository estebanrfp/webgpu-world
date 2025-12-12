/**
 * ========================================
 * Image Texture Loader
 * ========================================
 * Loads PNG, JPG, WebP textures
 */

/**
 * Load texture from image (PNG, JPG, WebP)
 * @param {GPUDevice} device 
 * @param {string} url 
 * @returns {Promise<GPUTexture>}
 */
export async function loadImageTexture(device, url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();

  const bitmap = await createImageBitmap(img);
  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source: bitmap },
    { texture },
    [bitmap.width, bitmap.height]
  );

  return texture;
}
