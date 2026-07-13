import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { ReportsService } from '../../application/services/reports.service';
import { ReportsPdfService } from '../../application/services/reports-pdf.service';

/**
 * Reportes operativos del tenant. `summary` (Inicio) es para los 3 roles;
 * la analítica por rango y su PDF son SOLO ADMIN (datos financieros por doctor).
 */
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly reportsPdf: ReportsPdfService,
  ) {}

  @Get('summary')
  @Roles('ADMIN', 'DOCTOR', 'STAFF')
  async summary(@CurrentUser('tenantId') tenantId: string) {
    const data = await this.reports.summary(tenantId);
    return { success: true, data };
  }

  @Get('analytics')
  @Roles('ADMIN')
  async analytics(
    @CurrentUser('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.reports.analytics(tenantId, from, to);
    return { success: true, data };
  }

  /** Citas pagadas que se cancelaron: el dinero pendiente de resolución. */
  @Get('cancelled-paid')
  @Roles('ADMIN')
  async cancelledPaid(
    @CurrentUser('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.reports.cancelledPaid(tenantId, from, to);
    return { success: true, data };
  }

  @Get('analytics/pdf')
  @Roles('ADMIN')
  async analyticsPdf(
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { buffer, filename } = await this.reportsPdf.generate(tenantId, from, to);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /**
   * Historial completo de citas del tenant en CSV (abre en Excel). Sin rango,
   * exporta TODO el historial; con from/to, esa franja.
   */
  @Get('appointments/csv')
  @Roles('ADMIN')
  async appointmentsCsv(
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { csv, filename } = await this.reports.appointmentsCsv(tenantId, from, to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM para que Excel detecte UTF-8 (tildes y ñ correctas).
    res.send('﻿' + csv);
  }
}
