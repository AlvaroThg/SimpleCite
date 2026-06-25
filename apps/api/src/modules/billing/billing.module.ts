import { Module } from '@nestjs/common';
import { BillingService } from './application/services/billing.service';
import { BillingController } from './infrastructure/adapters/billing.controller';
import { SubscriptionGuard } from './infrastructure/guards/subscription.guard';

/**
 * Módulo de facturación: estado de la suscripción del tenant y el
 * SubscriptionGuard que protege las rutas premium. La activación/renovación
 * se gestiona manualmente en DB (sin pasarela). PrismaService viene del
 * DatabaseModule global.
 */
@Module({
  controllers: [BillingController],
  providers: [BillingService, SubscriptionGuard],
  exports: [SubscriptionGuard, BillingService],
})
export class BillingModule {}
