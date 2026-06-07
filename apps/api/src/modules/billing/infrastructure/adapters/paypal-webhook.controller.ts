import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { Request } from 'express';
import { Public } from '../../../../common/decorators';
import { BillingService } from '../../application/services/billing.service';
import { PaypalClient } from '../../application/services/paypal.client';

interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string; // subscription id en BILLING.SUBSCRIPTION.*
    billing_agreement_id?: string; // subscription id en PAYMENT.SALE.*
    status?: string;
    billing_info?: { next_billing_time?: string };
  };
}

/**
 * Webhook de PayPal (Sandbox). `@Public()` para saltar el JwtAuthGuard global.
 *
 * Seguridad: verifica la firma del webhook consultando la API de PayPal
 * (verify-webhook-signature) usando los headers `paypal-transmission-*` y el
 * `PAYPAL_WEBHOOK_ID`. Si el webhook id no está configurado (dev), se omite la
 * verificación con un warning.
 *
 * Requiere `rawBody` (habilitado en main.ts) para verificar la firma sobre el
 * cuerpo crudo recibido, no re-serializado.
 */
@Public()
@Controller('webhooks/paypal')
export class PaypalWebhookController {
  constructor(
    private readonly billing: BillingService,
    private readonly paypal: PaypalClient,
    private readonly logger: Logger,
  ) {}

  @Post()
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('paypal-transmission-id') transmissionId?: string,
    @Headers('paypal-transmission-time') transmissionTime?: string,
    @Headers('paypal-transmission-sig') transmissionSig?: string,
    @Headers('paypal-cert-url') certUrl?: string,
    @Headers('paypal-auth-algo') authAlgo?: string,
  ) {
    const raw = req.rawBody;
    if (!raw || raw.length === 0) throw new BadRequestException('Cuerpo vacío');

    let event: PayPalWebhookEvent;
    try {
      event = JSON.parse(raw.toString('utf8')) as PayPalWebhookEvent;
    } catch {
      throw new BadRequestException('JSON inválido');
    }

    // ── Verificación de firma (contra Sandbox) ──
    if (this.paypal.webhookConfigured) {
      const ok = await this.paypal
        .verifyWebhookSignature({
          transmissionId,
          transmissionTime,
          transmissionSig,
          certUrl,
          authAlgo,
          event,
        })
        .catch((e) => {
          this.logger.error(
            { event: 'paypal.verify.error', err: (e as Error).message },
            'PaypalWebhookController',
          );
          return false;
        });
      if (!ok) {
        this.logger.warn(
          { event: 'paypal.webhook.bad-signature', type: event.event_type },
          'PaypalWebhookController',
        );
        throw new UnauthorizedException('Firma de webhook inválida');
      }
    } else {
      this.logger.warn(
        { event: 'paypal.webhook.no-verify' },
        'PAYPAL_WEBHOOK_ID no configurado — firma NO verificada (dev)',
      );
    }

    const type = event.event_type;
    // En PAYMENT.SALE.COMPLETED el id de suscripción viene en billing_agreement_id.
    const subId = event.resource?.billing_agreement_id ?? event.resource?.id;
    this.logger.log({ event: 'paypal.webhook.received', type, subId }, 'PaypalWebhookController');

    if ((type === 'BILLING.SUBSCRIPTION.ACTIVATED' || type === 'PAYMENT.SALE.COMPLETED') && subId) {
      await this.billing.activateBySubscriptionId(
        subId,
        event.resource?.billing_info?.next_billing_time,
      );
    } else if (type === 'BILLING.SUBSCRIPTION.CANCELLED' && subId) {
      await this.billing.setStatusBySubscriptionId(subId, 'CANCELED');
    } else if (
      (type === 'BILLING.SUBSCRIPTION.SUSPENDED' ||
        type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') &&
      subId
    ) {
      await this.billing.setStatusBySubscriptionId(subId, 'PAST_DUE');
    }

    return { received: true };
  }
}
