import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AppointmentsService } from './application/services/appointments.service';
import { AppointmentsCleanupService } from './application/services/appointments-cleanup.service';
import { AppointmentsController } from './infrastructure/adapters/appointments.controller';

@Module({
  imports: [BillingModule, MessagingModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsCleanupService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
