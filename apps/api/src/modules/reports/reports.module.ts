import { Module } from '@nestjs/common';
import { ReportsService } from './application/services/reports.service';
import { ReportsPdfService } from './application/services/reports-pdf.service';
import { ReportsController } from './infrastructure/adapters/reports.controller';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsPdfService],
})
export class ReportsModule {}
