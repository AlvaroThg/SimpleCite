import { Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { InjectBot, Start, On, Update, Ctx } from 'nestjs-telegraf';
import { Telegraf, type Context } from 'telegraf';
import type { IMessagingService, AppointmentConfirmationExtras } from './messaging.port';
import { ConversationEngine } from '../bot/application/services/conversation-engine.service';
import type { BotOutbound } from '../bot/bot.types';

/**
 * Adaptador de Telegram (Ports & Adapters) que implementa IMessagingService.
 * Usa Polling (configurado en el módulo) — ideal para desarrollo local sin
 * webhooks ni aprobaciones. Migrar a WhatsApp Cloud es cambiar el adaptador,
 * no el dominio.
 *
 * Entrantes: cada update se traduce a BotInbound y lo procesa el
 * ConversationEngine (agnóstico del canal); aquí solo se renderiza la
 * respuesta (inline keyboards). En Telegram el destinatario es un `chatId`
 * (en pruebas se guarda en `patient.phone`).
 */
@Update()
export class TelegramService implements IMessagingService {
  constructor(
    @Optional() @InjectBot() private readonly bot: Telegraf<Context> | undefined,
    private readonly config: ConfigService,
    private readonly engine: ConversationEngine,
    private readonly logger: Logger,
  ) {}

  // ─── Handlers entrantes (bot conversacional) ───

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    // Deep link: t.me/<bot>?start=<slug> llega como "/start <slug>".
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const payload = text.split(/\s+/)[1];
    await this.dispatch(ctx, { startPayload: payload || undefined });
  }

  @On('text')
  async onText(@Ctx() ctx: Context): Promise<void> {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    await this.dispatch(ctx, { text });
  }

  @On('callback_query')
  async onCallback(@Ctx() ctx: Context): Promise<void> {
    // Cortar el spinner del botón antes de procesar.
    await ctx.answerCbQuery().catch(() => undefined);
    const cb = ctx.callbackQuery;
    const data = cb && 'data' in cb ? cb.data : '';
    if (data) await this.dispatch(ctx, { callback: data });
  }

  @On('photo')
  async onPhoto(@Ctx() ctx: Context): Promise<void> {
    // Comprobante de pago: descargar la foto (mejor resolución) y pasarla al
    // motor. La descarga es responsabilidad del adaptador — en WhatsApp Cloud
    // la media se baja distinto, pero el motor recibe los mismos bytes.
    const message = ctx.message;
    if (!message || !('photo' in message) || message.photo.length === 0) return;

    try {
      const best = message.photo[message.photo.length - 1];
      const link = await ctx.telegram.getFileLink(best.file_id);
      const res = await fetch(link.href);
      if (!res.ok) throw new Error(`descarga de foto falló: HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const mimeType = res.headers.get('content-type') ?? 'image/jpeg';

      await this.dispatch(ctx, { photo: { buffer, mimeType } });
    } catch (err) {
      this.logger.error(
        { event: 'telegram.photo.error', err: (err as Error).message },
        'TelegramService',
      );
      await ctx.reply('No pude descargar tu imagen 😓. ¿La reenvías por favor?');
    }
  }

  /** Traduce el update a BotInbound, corre el motor y renderiza la respuesta. */
  private async dispatch(
    ctx: Context,
    input: {
      text?: string;
      callback?: string;
      startPayload?: string;
      photo?: { buffer: Buffer; mimeType: string };
    },
  ): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const replies = await this.engine.handle({
      channel: 'telegram',
      chatId: String(chatId),
      ...input,
    });
    for (const r of replies) await this.render(ctx, r);
  }

  private async render(ctx: Context, out: BotOutbound): Promise<void> {
    const extra = {
      ...(out.buttons
        ? {
            reply_markup: {
              inline_keyboard: out.buttons.map((row) =>
                row.map((b) => ({ text: b.label, callback_data: b.data })),
              ),
            },
          }
        : {}),
    };

    if (out.imageUrl) {
      // Foto con el texto como caption (fachada, QR de pago...). Si Telegram
      // no puede descargar la URL, degradar a texto para no perder el paso.
      try {
        await ctx.replyWithPhoto({ url: out.imageUrl }, { caption: out.text, ...extra });
        return;
      } catch {
        /* cae al mensaje de texto */
      }
    }
    await ctx.reply(out.text, { parse_mode: 'Markdown', ...extra });
  }

  // ─── IMessagingService (salientes) ───

  async sendMessage(to: string, content: string): Promise<void> {
    if (!this.bot) {
      this.logger.warn(
        { event: 'telegram.skip', to, reason: 'bot no inicializado' },
        `[DEV] Telegram no configurado — mensaje a ${to} omitido`,
      );
      return;
    }
    try {
      await this.bot.telegram.sendMessage(to, content);
      this.logger.log({ event: 'telegram.send.ok', to }, 'TelegramService');
    } catch (err) {
      this.logger.error(
        { event: 'telegram.send.error', to, err: (err as Error).message },
        'TelegramService',
      );
    }
  }

  async sendAppointmentConfirmation(
    to: string,
    patientName: string,
    doctorName: string,
    date: Date,
    cancellationToken: string,
    extras?: AppointmentConfirmationExtras,
  ): Promise<void> {
    const webUrl = (this.config.get<string>('WEB_PUBLIC_URL') ?? '').replace(/\/+$/, '');
    const when = new Intl.DateTimeFormat('es-BO', {
      timeZone: extras?.timezone ?? 'America/La_Paz',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(date);

    // Sin WEB_PUBLIC_URL el link saldría relativo con el token pelado: mejor
    // omitirlo; el paciente siempre puede cancelar escribiendo por el chat.
    const maps = extras?.mapsUrl ? `\n📍 Cómo llegar: ${extras.mapsUrl}\n` : '';
    const cancel = webUrl
      ? `\nSi no puedes asistir, cancélala aquí:\n${webUrl}/citas/cancelar?token=${cancellationToken}\n`
      : '\nSi no puedes asistir, escríbeme "cancelar" por este chat.\n';

    const text =
      `✅ Cita confirmada\n\n` +
      `Hola ${patientName}, tu cita con ${doctorName} quedó agendada para ${when}.\n` +
      maps +
      cancel +
      `\n— SimpleCite`;

    await this.sendMessage(to, text);
  }
}
