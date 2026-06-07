import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { ReportsService } from '../../application/services/reports.service';

/**
 * Reportes operativos del tenant (panel → Inicio). Autenticado; el tenantId
 * sale del JWT. Sin contenido clínico → accesible por los tres roles.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @Roles('ADMIN', 'DOCTOR', 'STAFF')
  async summary(@CurrentUser('tenantId') tenantId: string) {
    const data = await this.reports.summary(tenantId);
    return { success: true, data };
  }
}
