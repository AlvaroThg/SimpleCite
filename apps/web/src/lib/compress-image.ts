/**
 * Compresión de imágenes en el navegador antes de subirlas (viajan en base64
 * dentro del JSON hacia el API → R2).
 *
 * Reglas:
 *  - Se redimensiona a un máximo de 1600px en el lado mayor (suficiente para
 *    cualquier uso en pantalla; una foto de celular de 4000px no aporta nada).
 *  - PNG se mantiene PNG (sin pérdida): los QR bancarios y logos con
 *    transparencia no toleran artefactos JPEG.
 *  - Todo lo demás sale como JPEG calidad 0.85 — visualmente indistinguible
 *    del original en web, ~5-10x más liviano.
 *  - Archivos ya pequeños (<200KB) se suben tal cual: no hay nada que ganar.
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
const SKIP_UNDER_BYTES = 200 * 1024;

/** Lee un File como base64 (sin el prefijo data:). */
function readAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Devuelve la imagen lista para subir: `{ base64, mimeType }`, comprimida si
 * vale la pena. Si algo falla (formato raro, canvas bloqueado), cae al archivo
 * original — subir sin comprimir siempre es mejor que fallar.
 */
export async function compressImageFile(file: File): Promise<{ base64: string; mimeType: string }> {
  const original = async () => ({ base64: await readAsBase64(file), mimeType: file.type });

  if (!file.type.startsWith('image/') || file.size < SKIP_UNDER_BYTES) return original();

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

    // Ya es chica en píxeles y liviana no era (>200KB): igual re-encodeamos,
    // porque suele ser un PNG/JPEG mal comprimido.
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original();
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const keepPng = file.type === 'image/png';
    const mimeType = keepPng ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mimeType, keepPng ? undefined : JPEG_QUALITY);
    const base64 = dataUrl.split(',')[1];

    // Si comprimir salió peor (pasa con PNGs muy optimizados), usa el original.
    if (base64.length * 0.75 >= file.size) return original();
    return { base64, mimeType };
  } catch {
    return original();
  }
}
