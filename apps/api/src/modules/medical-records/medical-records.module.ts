import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MedicalRecordsService } from './application/services/medical-records.service';
import { PrescriptionsService } from './application/services/prescriptions.service';
import { PrescriptionPdfService } from './application/services/prescription-pdf.service';
import { MedicalRecordsController } from './infrastructure/adapters/medical-records.controller';
import { PrescriptionsController } from './infrastructure/adapters/prescriptions.controller';

/**
 * Módulo de atención médica: historia clínica estructurada (1-1 con la cita),
 * recetas digitales y generación de PDF de receta.
 */
@Module({
  imports: [BillingModule], // SubscriptionGuard
  controllers: [MedicalRecordsController, PrescriptionsController],
  providers: [MedicalRecordsService, PrescriptionsService, PrescriptionPdfService],
  exports: [MedicalRecordsService, PrescriptionsService],
})
export class MedicalRecordsModule {}
