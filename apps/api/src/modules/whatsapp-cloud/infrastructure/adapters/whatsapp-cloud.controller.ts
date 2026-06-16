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

/** Forma mínima del payload de webhook entrante de WhatsApp Cloud API. */
interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        messages?: Array<{
          from?: string; // E.164 sin '+'
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

/**
 * Webhook de la WhatsApp Cloud API (Meta). `@Public()` para saltar el JwtAuthGuard
 * global; `@SkipThrottle()` para no rate-limitar el tráfico entrante de Meta.
 *
 *   GET  /api/webhooks/whatsapp  → verificación (handshake con verify_token)
 *   POST /api/webhooks/whatsapp  → mensajes entrantes (auto-respuesta básica)
 *
 * La firma X-Hub-Signature-256 se verifica con META_WA_APP_SECRET sobre el
 * cuerpo crudo (rawBody, habilitado en main.ts). Sin app secret → solo dev.
 */
@Public()
@SkipThrottle()
@Controller('webhooks/whatsapp')
export class WhatsappCloudController {
  constructor(
    private readonly waCloud: WhatsappCloudService,
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
   * no reintente, y dispara la auto-respuesta de forma no bloqueante.
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
    const messages =
      body?.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];

    for (const msg of messages) {
      if (msg.type === 'text' && msg.from) {
        this.logger.log({ event: 'wa-cloud.inbound', from: msg.from }, 'WhatsappCloudController');
        // No bloqueante: la respuesta a Meta no debe esperar al envío saliente.
        void this.waCloud.sendText(
          msg.from,
          'Hola, soy el asistente de SimpleCite. Próximamente podrás agendar por aquí.',
        );
      }
    }

    return { received: true };
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
