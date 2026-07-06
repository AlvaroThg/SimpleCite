/**
 * Helpers de Google Maps para la landing del tenant.
 *
 * El embed por texto (`q=<dirección>`) depende de que Google geocodifique bien
 * la dirección escrita; con direcciones bolivianas informales suele caer en el
 * negocio equivocado. Si el admin pegó el link COMPLETO de Maps (el de la barra
 * del navegador), trae las coordenadas exactas y las usamos directamente.
 */

/** Extrae lat,lng de un link largo de Google Maps (formatos @lat,lng y !3d!4d). */
export function coordsFromMapsUrl(mapsUrl?: string | null): { lat: string; lng: string } | null {
  if (!mapsUrl) return null;
  // Formato de pin exacto: ...!3d-21.5335!4d-64.7295...
  const pin = mapsUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pin) return { lat: pin[1], lng: pin[2] };
  // Formato de cámara: .../@-21.5335,-64.7295,17z/...
  const cam = mapsUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (cam) return { lat: cam[1], lng: cam[2] };
  return null;
}

/**
 * URL del iframe del mapa: coordenadas exactas del link del admin si existen;
 * si no, búsqueda por la dirección textual. Null si no hay nada que mostrar.
 */
export function mapsEmbedSrc(mapsUrl?: string | null, address?: string | null): string | null {
  const coords = coordsFromMapsUrl(mapsUrl);
  if (coords) return `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=17&output=embed`;
  if (address)
    return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=16&output=embed`;
  return null;
}
