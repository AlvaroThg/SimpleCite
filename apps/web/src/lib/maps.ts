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
 * URL del iframe del mapa (Maps Embed API oficial).
 *
 * Antes se usaba `maps.google.com/maps?...&output=embed`, un endpoint no
 * documentado: Google lo cerró y hoy responde 301 hacia una URL que manda
 * `X-Frame-Options: SAMEORIGIN`, así que el navegador se niega a renderizarlo
 * dentro de un iframe ajeno — de ahí el recuadro gris roto en la landing.
 *
 * La vía soportada es la Maps Embed API, que exige una API key. Sin key se
 * devuelve null a propósito: la landing cae a la foto de fachada y al botón
 * "Cómo llegar", que es mucho mejor que un iframe roto.
 */
export function mapsEmbedSrc(mapsUrl?: string | null, address?: string | null): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) return null;

  const coords = coordsFromMapsUrl(mapsUrl);
  const q = coords ? `${coords.lat},${coords.lng}` : address;
  if (!q) return null;

  return (
    `https://www.google.com/maps/embed/v1/place?key=${key}` +
    `&q=${encodeURIComponent(q)}&zoom=${coords ? 17 : 16}&language=es`
  );
}
