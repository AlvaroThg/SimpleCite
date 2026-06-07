import { Module } from '@nestjs/common';
import { ReportsService } from './application/services/reports.service';
import { ReportsController } from './infrastructure/adapters/reports.controller';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
