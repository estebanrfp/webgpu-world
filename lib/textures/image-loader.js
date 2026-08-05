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
  // Decoded straight from the response blob instead of going through an
  // <img> element: HTMLImageElement.decode() never settles while the
  // document is hidden, so loading the world in a background tab used to
  // hang forever on the first normal map. createImageBitmap has no such
  // dependency on the rasterizer and decodes off the main thread.
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`);

  const bitmap = await createImageBitmap(await response.blob());
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
