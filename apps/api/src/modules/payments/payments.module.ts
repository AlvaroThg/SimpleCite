import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

import { QrSimpleClient } from './application/services/qr-simple.client';
import { PaymentsService } from './application/services/payments.service';
import { PaymentsWebhookService } from './application/services/payments-webhook.service';
import { PaymentReconciliationService } from './application/services/payment-reconciliation.service';

import { PaymentsPublicController } from './infrastructure/adapters/payments-public.controller';
import { PaymentsWebhookController } from './infrastructure/adapters/payments-webhook.controller';

import { PatientJwtStrategy } from '../public/infrastructure/strategies/patient-jwt.strategy';

/**
 * PaymentsModule — Pagos vía QR Simple (Fase 6).
 *
 * - QrSimpleClient: cliente de la pasarela (stub + real con circuit breaker).
 * - PaymentsService: emisión de intents + estado.
 * - PaymentsWebhookService: confirmación idempotente desde webhook.
 * - PaymentReconciliationService: @Cron de expiración/limpieza.
 *
 * Registra PatientJwtStrategy localmente para que PatientSessionGuard funcione
 * en los endpoints públicos de pago (mismo patrón que PublicModule).
 */
@Module({
  imports: [PassportModule, WhatsappModule],
  controllers: [PaymentsPublicController, PaymentsWebhookController],
  providers: [
    QrSimpleClient,
    PaymentsService,
    PaymentsWebhookService,
    PaymentReconciliationService,
    PatientJwtStrategy,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
