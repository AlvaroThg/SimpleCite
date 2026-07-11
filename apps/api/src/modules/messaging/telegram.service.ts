import { Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { InjectBot, Start, On, Update, Ctx } from 'nestjs-telegraf';
import { Telegraf, type Context } from 'telegraf';
import type { IMessagingService } from './messaging.port';

// En fase de pruebas el chatId hace de "teléfono" del paciente; mostrarlo en
// la respuesta evita tener que buscarlo con getUpdates o en los logs.
const testReply = (chatId?: number) =>
  'Hola, soy el asistente virtual de SimpleCite (Fase de Pruebas en Telegram). ' +
  'Próximamente podré agendar tus citas.' +
  (chatId ? `\n\nTu chat ID para pruebas: ${chatId}` : '');

/**
 * Adaptador de Telegram (Ports & Adapters) que implementa IMessagingService.
 * Usa Polling (configurado en el módulo) — ideal para desarrollo local sin
 * webhooks ni aprobaciones. Migrar a WhatsApp Cloud es cambiar el adaptador,
 * no el dominio.
 *
 * En Telegram el destinatario es un `chatId` (en pruebas se guarda en
 * `patient.phone`).
 */
@Update()
export class TelegramService implements IMessagingService {
  constructor(
    @Optional() @InjectBot() private readonly bot: Telegraf<Context> | undefined,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  // ─── Handlers entrantes (bot conversacional, fase de pruebas) ───

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    await ctx.reply(testReply(ctx.chat?.id));
  }

  @On('text')
  async onText(@Ctx() ctx: Context): Promise<void> {
    await ctx.reply(testReply(ctx.chat?.id));
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
