/**
 * Normaliza un teléfono a formato E.164 sin el prefijo '+' (solo dígitos).
 *
 * Reglas:
 *   - Elimina espacios, guiones, paréntesis y el '+' inicial.
 *   - Si empieza con '00' (prefijo internacional alternativo), lo quita.
 *   - Bolivia: si quedan 8 dígitos (número local sin código de país),
 *     antepone el código 591.
 *
 * Ejemplos:
 *   "+591 700-00000" → "59170000000"
 *   "70000000"       → "59170000000"  (asume Bolivia)
 *   "0059170000000"  → "59170000000"
 *
 * @param defaultCountryCode código de país a anteponer para números locales (default Bolivia '591')
 */
export function normalizePhone(input: string, defaultCountryCode = '591'): string {
  let digits = input.replace(/[^\d]/g, ''); // solo dígitos

  // Quitar prefijo internacional '00'
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // Número local boliviano (8 dígitos) → anteponer código de país
  if (digits.length === 8) {
    digits = defaultCountryCode + digits;
  }

  return digits;
}

/**
 * Valida que un teléfono normalizado tenga forma E.164 plausible
 * (7-15 dígitos, sin cero inicial de código de país).
 */
export function isValidE164(digits: string): boolean {
  return /^[1-9]\d{7,14}$/.test(digits);
}

/**
 * Normaliza una cédula de identidad: trim + uppercase + sin espacios internos.
 * (Las CI bolivianas pueden tener complementos alfanuméricos como "1234567-1A".)
 */
export function normalizeCi(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}
