import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { AppointmentsService } from './application/services/appointments.service';
import { AppointmentsController } from './infrastructure/adapters/appointments.controller';

@Module({
  imports: [BillingModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
