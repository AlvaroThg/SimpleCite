import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MedicalRecordsService } from './application/services/medical-records.service';
import { PrescriptionsService } from './application/services/prescriptions.service';
import { PrescriptionPdfService } from './application/services/prescription-pdf.service';
import { AppointmentReportPdfService } from './application/services/appointment-report-pdf.service';
import { MedicalRecordsController } from './infrastructure/adapters/medical-records.controller';
import { PrescriptionsController } from './infrastructure/adapters/prescriptions.controller';
import { AppointmentReportController } from './infrastructure/adapters/appointment-report.controller';

/**
 * Módulo de atención médica: historia clínica estructurada (1-1 con la cita),
 * recetas digitales, PDF de receta e informe PDF de la cita.
 */
@Module({
  imports: [BillingModule], // SubscriptionGuard
  controllers: [MedicalRecordsController, PrescriptionsController, AppointmentReportController],
  providers: [
    MedicalRecordsService,
    PrescriptionsService,
    PrescriptionPdfService,
    AppointmentReportPdfService,
  ],
  exports: [MedicalRecordsService, PrescriptionsService],
})
export class MedicalRecordsModule {}
