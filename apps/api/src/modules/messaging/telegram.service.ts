import { Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { InjectBot, Start, On, Update, Ctx } from 'nestjs-telegraf';
import { Telegraf, type Context } from 'telegraf';
import type { IMessagingService } from './messaging.port';
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
    // Fase 2: comprobantes de pago por foto (con revisión del staff).
    await ctx.reply(
      'Recibí tu imagen 🙌 pero todavía no proceso comprobantes por aquí. ' +
        'Muy pronto podrás enviar tu comprobante de pago por este chat.',
    );
  }

  /** Traduce el update a BotInbound, corre el motor y renderiza la respuesta. */
  private async dispatch(
    ctx: Context,
    input: { text?: string; callback?: string; startPayload?: string },
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
    await ctx.reply(out.text, {
      parse_mode: 'Markdown',
      ...(out.buttons
        ? {
            reply_markup: {
              inline_keyboard: out.buttons.map((row) =>
                row.map((b) => ({ text: b.label, callback_data: b.data })),
              ),
            },
          }
        : {}),
    });
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
  ): Promise<void> {
    const webUrl = (this.config.get<string>('WEB_PUBLIC_URL') ?? '').replace(/\/+$/, '');
    const link = `${webUrl}/citas/cancelar?token=${cancellationToken}`;
    const when = new Intl.DateTimeFormat('es-BO', {
      timeZone: 'America/La_Paz',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(date);

    const text =
      `✅ Cita confirmada\n\n` +
      `Hola ${patientName}, tu cita con ${doctorName} quedó agendada para ${when}.\n\n` +
      `Si no puedes asistir, cancélala aquí:\n${link}\n\n— SimpleCite`;

    await this.sendMessage(to, text);
  }
}
