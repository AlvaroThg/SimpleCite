/**
 * Utilidades de contraste para el color de marca arbitrario de cada tenant.
 * Implementa la "Regla del Tenant" del DESIGN.md: toda superficie debe mantener
 * AA con cualquier hue que la clínica configure.
 *
 * Funciones puras (sin React): usables en Server y Client Components.
 */

type RGB = [number, number, number];

const WHITE: RGB = [255, 255, 255];
const INK: RGB = [15, 23, 42]; // slate-900 #0f172a

function parseHex(hex: string): RGB {
  let h = hex.replace('#', '').trim();
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: RGB): string {
  return (
    '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')
  );
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Color de texto legible (blanco o tinta navy) SOBRE el color dado. WCAG AA. */
export function readableOn(bg: string): string {
  try {
    const rgb = parseHex(bg);
    return contrast(rgb, WHITE) >= contrast(rgb, INK) ? '#ffffff' : '#0f172a';
  } catch {
    return '#ffffff';
  }
}

/**
 * Variante AA-safe del color para usarlo como TEXTO sobre un fondo claro (blanco
 * por defecto). Oscurece manteniendo el hue hasta alcanzar ≥4.5:1. Si ya cumple,
 * lo devuelve igual. Resuelve "texto pequeño en el color del tenant sobre blanco".
 */
export function accentOn(color: string, bg = '#ffffff'): string {
  try {
    let rgb = parseHex(color);
    const bgRgb = parseHex(bg);
    let guard = 0;
    while (contrast(rgb, bgRgb) < 4.5 && guard < 40) {
      rgb = [Math.round(rgb[0] * 0.9), Math.round(rgb[1] * 0.9), Math.round(rgb[2] * 0.9)];
      guard += 1;
    }
    return toHex(rgb);
  } catch {
    return color;
  }
}
