import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import type {
  IMessagingService,
  AppointmentConfirmationExtras,
} from '../../../messaging/messaging.port';
import type { BotOutbound } from '../../../bot/bot.types';

/** Recorta con elipsis a los límites de los widgets de Meta. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Adaptador de la WhatsApp Cloud API oficial de Meta (Ports & Adapters):
 * implementa IMessagingService. Modelo "bot centralizado" (un único número de la
 * plataforma). Envía vía la Graph API con `fetch` nativo (Node 20+).
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
export class WhatsappCloudService implements IMessagingService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  /** Puerto IMessagingService: envío de texto simple (devuelve void). */
  async sendMessage(to: string, content: string): Promise<void> {
    await this.sendText(to, content);
  }

  /** True solo si hay phoneNumberId + accessToken configurados. */
  get isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('META_WA_PHONE_NUMBER_ID') &&
      this.config.get<string>('META_WA_ACCESS_TOKEN'),
    );
  }

  /** Base de la Graph API (versionada); default razonable si no se configura. */
  private get baseUrl(): string {
    return this.config.get<string>('META_WA_BASE_URL') || 'https://graph.facebook.com/v25.0';
  }

  /**
   * Envía un mensaje de texto simple por la Cloud API.
   * @param to    Teléfono destino en E.164 SIN '+', ej: 59170000000.
   * @param body  Texto del mensaje (admite formato de WhatsApp: *negrita*, etc.).
   * @returns El message id de Meta, o null si no se pudo enviar.
   */
  async sendText(to: string, body: string): Promise<string | null> {
    return this.post(to, {
      type: 'text',
      // preview_url: true → WhatsApp renderiza la vista previa del enlace.
      text: { preview_url: true, body },
    });
  }

  /** Envía una imagen por URL pública, con caption opcional. */
  async sendImage(to: string, link: string, caption?: string): Promise<string | null> {
    return this.post(to, { type: 'image', image: { link, ...(caption ? { caption } : {}) } });
  }

  /**
   * Renderiza un BotOutbound del motor conversacional como mensajes de la
   * Cloud API: imagen (con caption), botones interactivos (≤3 reply buttons),
   * lista interactiva (4-10 opciones) o texto plano.
   *
   * Límites de Meta: título de reply button ≤20 chars; fila de lista: título
   * ≤24 + descripción ≤72. Los labels largos van truncados al título y
   * completos en la descripción.
   */
  async renderOutbound(to: string, out: BotOutbound): Promise<void> {
    const flat = (out.buttons ?? []).flat();

    if (out.imageUrl) {
      // Meta no soporta imagen + botones en un solo mensaje, y además entrega
      // las imágenes más lento que el texto (procesa la media), lo que cruzaba
      // el orden. Por eso: la imagen va sola y el TEXTO viaja junto a los
      // botones — legible aunque la entrega se cruce — con una pausa que
      // favorece el orden correcto.
      await this.sendImage(to, out.imageUrl);
      if (out.text || flat.length > 0) {
        await new Promise((r) => setTimeout(r, 1500));
        await this.renderOutbound(to, { text: out.text, buttons: out.buttons });
      }
      return;
    }

    if (flat.length === 0) {
      await this.sendText(to, out.text);
      return;
    }

    if (flat.length <= 3) {
      await this.post(to, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: out.text },
          action: {
            buttons: flat.map((b) => ({
              type: 'reply',
              reply: { id: b.data, title: truncate(b.label, 20) },
            })),
          },
        },
      });
      return;
    }

    await this.post(to, {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: out.text },
        action: {
          button: 'Ver opciones',
          sections: [
            {
              title: 'Opciones',
              rows: flat.slice(0, 10).map((b) => this.listRow(b.data, b.label)),
            },
          ],
        },
      },
    });
  }

  /**
   * Fila de lista interactiva. Los labels del motor vienen como
   * "Título — detalle" (ej. "Tratamiento de Columna — Bs 150"): el título va
   * al campo title (≤24) y el detalle a description (≤72), en vez de truncar
   * a ciegas el label completo.
   */
  private listRow(id: string, label: string) {
    const sep = label.indexOf(' — ');
    const title = sep > 0 ? label.slice(0, sep) : label;
    const detail = sep > 0 ? label.slice(sep + 3) : '';
    const overflow = title.length > 24 && !detail ? label : detail;
    return {
      id,
      title: truncate(title, 24),
      ...(overflow ? { description: truncate(overflow, 72) } : {}),
    };
  }

  /**
   * Descarga una media entrante (comprobante en foto): la Graph API primero
   * resuelve el media id a una URL temporal y luego se baja con el token.
   */
  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    if (!this.isConfigured) return null;
    const accessToken = this.config.get<string>('META_WA_ACCESS_TOKEN');
    try {
      const metaRes = await fetch(`${this.baseUrl}/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
      if (!metaRes.ok || !meta.url) throw new Error(`media meta HTTP ${metaRes.status}`);

      const fileRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!fileRes.ok) throw new Error(`media download HTTP ${fileRes.status}`);
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      const contentType = meta.mime_type ?? fileRes.headers.get('content-type') ?? '';
      const mimeType = contentType.startsWith('image/') ? contentType : 'image/jpeg';
      return { buffer, mimeType };
    } catch (err) {
      this.logger.error(
        { event: 'wa-cloud.media.error', mediaId, err: (err as Error).message },
        'WhatsappCloudService',
      );
      return null;
    }
  }

  /** POST genérico a /messages. Best-effort: loguea y devuelve null en error. */
  private async post(to: string, message: Record<string, unknown>): Promise<string | null> {
    if (!this.isConfigured) {
      this.logger.warn(
        { event: 'wa-cloud.skip', to, reason: 'META_WA_* no configurado' },
        `[DEV] WhatsApp Cloud no configurado — mensaje a ${to} omitido`,
      );
      return null;
    }

    const phoneNumberId = this.config.get<string>('META_WA_PHONE_NUMBER_ID');
    const accessToken = this.config.get<string>('META_WA_ACCESS_TOKEN');
    const url = `${this.baseUrl}/${phoneNumberId}/messages`;

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
          ...message,
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
   * Puerto IMessagingService: confirma la cita al paciente. `to` es el
   * teléfono E.164 sin '+'. Ubicación si hay mapsUrl; magic link solo con
   * WEB_PUBLIC_URL configurada (un token pelado es ruido para el paciente).
   */
  async sendAppointmentConfirmation(
    to: string,
    patientName: string,
    doctorName: string,
    date: Date,
    cancellationToken: string,
    extras?: AppointmentConfirmationExtras,
  ): Promise<void> {
    const webUrl = (this.config.get<string>('WEB_PUBLIC_URL') ?? '').replace(/\/+$/, '');
    const when = this.formatDate(date, extras?.timezone ?? undefined);

    const maps = extras?.mapsUrl ? `\n📍 Cómo llegar: ${extras.mapsUrl}\n` : '';
    const cancel = webUrl
      ? `\nSi no puedes asistir, cancélala desde aquí:\n${webUrl}/citas/cancelar?token=${cancellationToken}\n`
      : '\nSi no puedes asistir, escríbenos "cancelar" por este chat.\n';

    const body =
      `✅ *Cita confirmada*\n\n` +
      `Hola ${patientName} 👋 Tu cita con *${doctorName}* quedó agendada para *${when}*.\n` +
      maps +
      cancel +
      `\n— SimpleCite`;

    await this.sendText(to, body);
  }

  /** Formatea la fecha/hora en español boliviano (timezone del tenant). */
  private formatDate(date: Date, timezone?: string): string {
    return new Intl.DateTimeFormat('es-BO', {
      timeZone: timezone ?? 'America/La_Paz',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(date);
  }
}
