const LIMIT = 2 * 1024 * 1024;
const MAX_SIDE = 1600;

/** Phone photos can pass the upload limit, so large ones are resized on the device first. */
export async function shrinkImage(file: File): Promise<Blob> {
  if (file.size <= LIMIT) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.85));
  // Browsers without a WebP encoder return PNG, which would stay large.
  const webp = await encode('image/webp');
  const blob = webp?.type === 'image/webp' ? webp : await encode('image/jpeg');
  return blob || file;
}
