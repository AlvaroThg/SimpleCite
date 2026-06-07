import { Module } from '@nestjs/common';
import { BillingService } from './application/services/billing.service';
import { PaypalClient } from './application/services/paypal.client';
import { BillingController } from './infrastructure/adapters/billing.controller';
import { PaypalWebhookController } from './infrastructure/adapters/paypal-webhook.controller';
import { SubscriptionGuard } from './infrastructure/guards/subscription.guard';

/**
 * Módulo de facturación: vinculación de suscripciones de PayPal, webhook
 * listener y el SubscriptionGuard. PrismaService viene del DatabaseModule global.
 */
@Module({
  controllers: [BillingController, PaypalWebhookController],
  providers: [BillingService, PaypalClient, SubscriptionGuard],
  exports: [SubscriptionGuard, BillingService],
})
export class BillingModule {}
