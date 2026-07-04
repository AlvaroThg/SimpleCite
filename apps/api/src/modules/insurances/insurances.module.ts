import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { InsurancesService } from './application/services/insurances.service';
import { InsurancesController } from './infrastructure/adapters/insurances.controller';

/** Seguros médicos: catálogo del tenant + asignación por doctor (Addendum G). */
@Module({
  imports: [BillingModule], // SubscriptionGuard
  controllers: [InsurancesController],
  providers: [InsurancesService],
  exports: [InsurancesService],
})
export class InsurancesModule {}
