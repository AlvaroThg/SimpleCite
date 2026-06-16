import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

/**
 * Cliente de la WhatsApp Cloud API oficial de Meta (modelo "bot centralizado":
 * un único número de la plataforma). Envía mensajes salientes vía la Graph API
 * usando `fetch` nativo (Node 20+), sin dependencias extra.
 *
 * Config (ver packages/config/src/env.ts):
 *   META_WA_BASE_URL         — base versionada de la Graph API
 *   META_WA_PHONE_NUMBER_ID  — Phone Number ID del número Business
 *   META_WA_ACCESS_TOKEN     — token permanente (System User)
 *   WEB_PUBLIC_URL           — base del frontend para los enlaces al paciente
 *
 * Si falta config (dev sin credenciales), los envíos se loguean y se omiten
 * sin romper el flujo que los invoca (best-effort).
 */
@Injectable()
export class WhatsappCloudService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  /** True solo si hay phoneNumberId + accessToken configurados. */
  get isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('META_WA_PHONE_NUMBER_ID') &&
      this.config.get<string>('META_WA_ACCESS_TOKEN'),
    );
  }

  /**
   * Envía un mensaje de texto simple por la Cloud API.
   * @param to    Teléfono destino en E.164 SIN '+', ej: 59170000000.
   * @param body  Texto del mensaje (admite formato de WhatsApp: *negrita*, etc.).
   * @returns El message id de Meta, o null si no se pudo enviar.
   */
  async sendText(to: string, body: string): Promise<string | null> {
    if (!this.isConfigured) {
      this.logger.warn(
        { event: 'wa-cloud.skip', to, reason: 'META_WA_* no configurado' },
        `[DEV] WhatsApp Cloud no configurado — mensaje a ${to} omitido`,
      );
      return null;
    }

    const baseUrl = this.config.get<string>('META_WA_BASE_URL');
    const phoneNumberId = this.config.get<string>('META_WA_PHONE_NUMBER_ID');
    const accessToken = this.config.get<string>('META_WA_ACCESS_TOKEN');
    const url = `${baseUrl}/${phoneNumberId}/messages`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          // preview_url: true → WhatsApp renderiza la vista previa del enlace.
          text: { preview_url: true, body },
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string };
      };

      if (!res.ok) {
        this.logger.error(
          { event: 'wa-cloud.send.error', to, status: res.status, error: payload.error?.message },
          'WhatsappCloudService',
        );
        return null;
      }

      const messageId = payload.messages?.[0]?.id ?? null;
      this.logger.log({ event: 'wa-cloud.send.ok', to, messageId }, 'WhatsappCloudService');
      return messageId;
    } catch (err) {
      this.logger.error(
        { event: 'wa-cloud.send.exception', to, err: (err as Error).message },
        'WhatsappCloudService',
      );
      return null;
    }
  }

  /**
   * Notifica al paciente que su cita quedó confirmada e incluye el magic link
   * de cancelación (token generado al crear la cita).
   */
  async sendAppointmentConfirmation(
    patientPhone: string,
    doctorName: string,
    date: Date,
    cancellationToken: string,
  ): Promise<string | null> {
    const webUrl = (this.config.get<string>('WEB_PUBLIC_URL') ?? '').replace(/\/+$/, '');
    const cancelLink = `${webUrl}/citas/cancelar?token=${cancellationToken}`;
    const when = this.formatDate(date);

    const body =
      `✅ *Cita confirmada*\n\n` +
      `Hola 👋 Tu cita con *${doctorName}* quedó agendada para *${when}*.\n\n` +
      `Si no puedes asistir, cancélala desde aquí:\n${cancelLink}\n\n` +
      `— SimpleCite`;

    return this.sendText(patientPhone, body);
  }

  /** Formatea la fecha/hora en español boliviano (timezone America/La_Paz). */
  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('es-BO', {
      timeZone: 'America/La_Paz',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(date);
  }
}
