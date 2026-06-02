import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { Public } from '../../../../common/decorators';
import {
  PaymentsWebhookService,
  type PaymentWebhookPayload,
} from '../../application/services/payments-webhook.service';

/**
 * Webhook de confirmación de pagos del proveedor QR Simple.
 *
 * POST /api/webhooks/payments
 *
 * Seguridad:
 *   - `@Public()` para bypassear el JwtAuthGuard global.
 *   - Validación de firma HMAC-SHA256 sobre el cuerpo CRUDO (req.rawBody)
 *     usando QR_SIMPLE_WEBHOOK_SECRET. Si el secret no está configurado
 *     (dev), se omite la validación.
 *   - Deduplicación + idempotencia las maneja PaymentsWebhookService.
 *
 * No resuelve tenant (endpoint de sistema): el tenant se deriva del intent.
 */
@Public()
@Controller('webhooks/payments')
export class PaymentsWebhookController {
  private readonly secret: string | undefined;

  constructor(
    private readonly webhookService: PaymentsWebhookService,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {
    this.secret = this.config.get<string>('QR_SIMPLE_WEBHOOK_SECRET');
  }

  @Post()
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-signature') signature: string | undefined,
  ) {
    const raw = req.rawBody;
    if (!raw || raw.length === 0) {
      throw new BadRequestException('Cuerpo vacío');
    }

    // Validar firma (si hay secret configurado)
    if (this.secret) {
      this.verifySignature(raw, signature);
    } else {
      this.logger.warn(
        { event: 'payment.webhook.no-secret' },
        'QR_SIMPLE_WEBHOOK_SECRET no configurado — firma NO validada (dev)',
      );
    }

    // Parsear payload
    let payload: PaymentWebhookPayload;
    let rawParsed: unknown;
    try {
      rawParsed = JSON.parse(raw.toString('utf8'));
      payload = rawParsed as PaymentWebhookPayload;
    } catch {
      throw new BadRequestException('JSON inválido');
    }

    if (!payload.eventId || !payload.providerPaymentId || !payload.status) {
      throw new BadRequestException('Payload incompleto (eventId, providerPaymentId, status)');
    }

    const result = await this.webhookService.process(payload, rawParsed);
    return { received: true, deduplicated: result.deduplicated };
  }

  private verifySignature(raw: Buffer, signature: string | undefined) {
    if (!signature) {
      throw new UnauthorizedException('Falta header X-Signature');
    }

    const expected = createHmac('sha256', this.secret!).update(raw).digest('hex');

    // Comparación en tiempo constante para evitar timing attacks.
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      this.logger.warn({ event: 'payment.webhook.bad-signature' }, 'PaymentsWebhookController');
      throw new UnauthorizedException('Firma inválida');
    }
  }
}
