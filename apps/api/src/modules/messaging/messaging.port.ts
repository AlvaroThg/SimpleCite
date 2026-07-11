/**
 * Puerto (Ports & Adapters) para mensajería saliente al paciente. Desacopla el
 * canal (Telegram en pruebas, WhatsApp Cloud en producción) del dominio de
 * citas. Inyectar por el token `MESSAGING_SERVICE`, no por una clase concreta.
 *
 * `to` es el identificador del destinatario en el canal activo:
 *   - Telegram: chatId (guardado en `patient.phone` durante las pruebas).
 *   - WhatsApp: teléfono E.164 sin '+'.
 */
export interface AppointmentConfirmationExtras {
  /// Link de Google Maps de la clínica ("Cómo llegar").
  mapsUrl?: string | null;
  /// Timezone del tenant para formatear la fecha (default America/La_Paz).
  timezone?: string | null;
}

export interface IMessagingService {
  /** Envía un texto simple al destinatario. Best-effort: no debe lanzar. */
  sendMessage(to: string, content: string): Promise<void>;

  /**
   * Confirma una cita. Incluye la ubicación si hay mapsUrl, y el magic link de
   * cancelación SOLO si WEB_PUBLIC_URL está configurada (un token pelado sin
   * base pública es ruido para el paciente).
   */
  sendAppointmentConfirmation(
    to: string,
    patientName: string,
    doctorName: string,
    date: Date,
    cancellationToken: string,
    extras?: AppointmentConfirmationExtras,
  ): Promise<void>;
}

/** Token DI del puerto de mensajería. */
export const MESSAGING_SERVICE = Symbol('MESSAGING_SERVICE');
