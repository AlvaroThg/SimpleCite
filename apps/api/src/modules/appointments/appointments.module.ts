import { Module } from '@nestjs/common';
import { AppointmentsService } from './application/services/appointments.service';
import { AppointmentsController } from './infrastructure/adapters/appointments.controller';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
