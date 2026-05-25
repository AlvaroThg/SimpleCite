import { Module } from '@nestjs/common';
import { ScheduleService } from './application/services/schedule.service';
import { ScheduleController } from './infrastructure/adapters/schedule.controller';

@Module({
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
