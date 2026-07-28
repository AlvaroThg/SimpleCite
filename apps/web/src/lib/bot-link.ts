/**
 * Deep links al bot de reservas de la plataforma (Telegram en pruebas,
 * WhatsApp Cloud en producción). `NEXT_PUBLIC_BOT_URL` es la base del chat
 * (ej. https://t.me/Simplecite_bot o https://wa.me/59171234567); si no está
 * configurada, las superficies que la usan simplemente no muestran el CTA.
 *
 * Payloads que entiende el motor conversacional (apps/api/modules/bot):
 *   - `<slug>`            → abre la conversación con la clínica ya resuelta.
 *   - `r-<appointmentId>` → prepara el envío del comprobante de esa reserva.
 */
const BOT_URL = (process.env.NEXT_PUBLIC_BOT_URL ?? '').replace(/\/+$/, '');

export function botDeepLink(payload: string): string | null {
  if (!BOT_URL) return null;
  // WhatsApp no tiene "start payload": va como texto prellenado del mensaje.
  // Para el slug de clínica prellenamos una frase natural (el motor extrae el
  // slug de la frase); el comprobante viaja como token crudo tal cual.
  if (BOT_URL.includes('wa.me')) {
    const text = payload.startsWith('r-')
      ? payload
      : `Hola 👋 Quiero reservar una cita en ${payload}`;
    return `${BOT_URL}?text=${encodeURIComponent(text)}`;
  }
  return `${BOT_URL}?start=${encodeURIComponent(payload)}`;
}
