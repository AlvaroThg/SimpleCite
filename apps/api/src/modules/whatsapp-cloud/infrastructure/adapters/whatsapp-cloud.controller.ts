import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  Post,
  Req,
  Query,
  Headers,
  ForbiddenException,
  HttpCode,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import type { Request } from 'express';
import { Public } from '../../../../common/decorators';
import { WhatsappCloudService } from '../../application/services/whatsapp-cloud.service';
import { ConversationEngine } from '../../../bot/application/services/conversation-engine.service';
import type { BotInbound } from '../../../bot/bot.types';

/** Forma mínima del payload de webhook entrante de WhatsApp Cloud API. */
interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        messages?: Array<MetaInboundMessage>;
      };
    }>;
  }>;
}

interface MetaInboundMessage {
  id?: string; // wamid — clave del dedupe (Meta reintenta webhooks)
  from?: string; // E.164 sin '+'
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
}

/// Meta reintenta el webhook si no respondemos rápido: memoria corta de wamids
/// ya procesados para no duplicar reservas. En memoria alcanza (una instancia).
const PROCESSED_MAX = 500;

/**
 * Webhook de la WhatsApp Cloud API (Meta). `@Public()` para saltar el JwtAuthGuard
 * global; `@SkipThrottle()` para no rate-limitar el tráfico entrante de Meta.
 *
 *   GET  /api/webhooks/whatsapp  → verificación (handshake con verify_token)
 *   POST /api/webhooks/whatsapp  → mensajes entrantes → ConversationEngine
 *
 * Adaptador de canal (Ports & Adapters): traduce texto / botones interactivos /
 * imágenes de Meta a BotInbound y renderiza los BotOutbound del motor como
 * reply buttons, listas o imágenes. El motor es el mismo que usa Telegram.
 *
 * La firma X-Hub-Signature-256 se verifica con META_WA_APP_SECRET sobre el
 * cuerpo crudo (rawBody, habilitado en main.ts). Sin app secret → solo dev.
 */
@Public()
@SkipThrottle()
@Controller('webhooks/whatsapp')
export class WhatsappCloudController {
  private readonly processed = new Set<string>();

  constructor(
    private readonly waCloud: WhatsappCloudService,
    private readonly engine: ConversationEngine,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  /**
   * Verificación del webhook que exige Meta al registrar la URL.
   * Meta envía hub.mode=subscribe, hub.verify_token y hub.challenge; si el token
   * coincide con el nuestro, devolvemos el challenge tal cual (texto plano).
   */
  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expected = this.config.get<string>('META_WA_VERIFY_TOKEN');
    if (mode === 'subscribe' && token && expected && token === expected) {
      this.logger.log({ event: 'wa-cloud.webhook.verified' }, 'WhatsappCloudController');
      return challenge ?? '';
    }
    this.logger.warn({ event: 'wa-cloud.webhook.verify-failed', mode }, 'WhatsappCloudController');
    throw new ForbiddenException('Verificación de webhook fallida');
  }

  /**
   * Recepción de eventos entrantes. Responde 200 siempre (rápido) para que Meta
   * no reintente, y procesa los mensajes de forma no bloqueante.
   */
  @Post()
  @HttpCode(200)
  handleIncoming(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature?: string,
  ): { received: true } {
    if (!this.verifySignature(req.rawBody, signature)) {
      this.logger.warn({ event: 'wa-cloud.webhook.bad-signature' }, 'WhatsappCloudController');
      throw new ForbiddenException('Firma inválida');
    }

    const body = req.body as MetaWebhookBody;
    // Los eventos de estado (delivered/read) llegan como value.statuses y no
    // traen messages: se ignoran solos con este flatten.
    const messages =
      body?.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];

    for (const msg of messages) {
      if (!msg.from || this.alreadyProcessed(msg.id)) continue;
      // No bloqueante: la respuesta 200 a Meta no espera al motor.
      void this.process(msg).catch((err) =>
        this.logger.error(
          { event: 'wa-cloud.inbound.error', from: msg.from, err: (err as Error).message },
          'WhatsappCloudController',
        ),
      );
    }

    return { received: true };
  }

  /** Traduce el mensaje de Meta a BotInbound, corre el motor y responde. */
  private async process(msg: MetaInboundMessage): Promise<void> {
    const from = msg.from!;
    const inbound: BotInbound = { channel: 'whatsapp', chatId: from };

    if (msg.type === 'text' && msg.text?.body) {
      inbound.text = msg.text.body;
    } else if (msg.type === 'interactive') {
      const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
      if (!reply?.id) return;
      inbound.callback = reply.id;
    } else if (msg.type === 'image' && msg.image?.id) {
      const media = await this.waCloud.downloadMedia(msg.image.id);
      if (!media) {
        await this.waCloud.sendText(
          from,
          'No pude descargar tu imagen 😓. ¿La reenvías por favor?',
        );
        return;
      }
      inbound.photo = media;
    } else {
      // Audio, stickers, ubicación…: fuera del alcance del bot por ahora.
      await this.waCloud.sendText(
        from,
        'Por ahora solo entiendo mensajes de texto, botones y fotos de comprobantes 🙂',
      );
      return;
    }

    this.logger.log({ event: 'wa-cloud.inbound', from, type: msg.type }, 'WhatsappCloudController');
    const replies = await this.engine.handle(inbound);
    for (const out of replies) await this.waCloud.renderOutbound(from, out);
  }

  /** Dedupe por wamid con memoria acotada (FIFO aproximado). */
  private alreadyProcessed(wamid?: string): boolean {
    if (!wamid) return false;
    if (this.processed.has(wamid)) return true;
    this.processed.add(wamid);
    if (this.processed.size > PROCESSED_MAX) {
      const first = this.processed.values().next().value;
      if (first) this.processed.delete(first);
    }
    return false;
  }

  /**
   * Verifica X-Hub-Signature-256 = "sha256=" + HMAC_SHA256(rawBody, appSecret).
   * Si no hay app secret configurado, se omite (modo dev) con warning.
   */
  private verifySignature(rawBody: Buffer | undefined, signature?: string): boolean {
    const appSecret = this.config.get<string>('META_WA_APP_SECRET');
    if (!appSecret) {
      this.logger.warn(
        { event: 'wa-cloud.webhook.no-verify' },
        'META_WA_APP_SECRET no configurado — firma NO verificada (dev)',
      );
      return true;
    }
    if (!rawBody || !signature?.startsWith('sha256=')) return false;

    const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
