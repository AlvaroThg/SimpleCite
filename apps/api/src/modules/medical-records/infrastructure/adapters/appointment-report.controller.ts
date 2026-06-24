import { Controller, Get, Param, UseGuards, StreamableFile } from '@nestjs/common';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { SubscriptionGuard } from '../../../billing/infrastructure/guards/subscription.guard';
import { AppointmentReportPdfService } from '../../application/services/appointment-report-pdf.service';
import type { RequesterContext } from '../../application/services/medical-records.service';

/**
 * Informe PDF de una cita atendida (formato APA, fuente Inter, logo del tenant).
 *   GET /api/appointments/:appointmentId/report  → PDF descargable (stream)
 */
@UseGuards(SubscriptionGuard)
@Controller('appointments')
export class AppointmentReportController {
  constructor(private readonly report: AppointmentReportPdfService) {}

  @Get(':appointmentId/report')
  @Roles('ADMIN', 'DOCTOR')
  async download(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Param('appointmentId') appointmentId: string,
  ): Promise<StreamableFile> {
    const ctx: RequesterContext = { tenantId, userId, role: role as RequesterContext['role'] };
    const { buffer, filename } = await this.report.generate(ctx, appointmentId);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
