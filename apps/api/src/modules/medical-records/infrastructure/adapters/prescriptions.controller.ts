import { Controller, Get, Delete, Param, UseGuards, StreamableFile } from '@nestjs/common';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { SubscriptionGuard } from '../../../billing/infrastructure/guards/subscription.guard';
import { PrescriptionsService } from '../../application/services/prescriptions.service';
import { PrescriptionPdfService } from '../../application/services/prescription-pdf.service';
import type { RequesterContext } from '../../application/services/medical-records.service';

/**
 * Acceso a una receta puntual + descarga del PDF. Panel staff/doctor.
 *
 *   GET    /prescriptions/:id        → datos de la receta
 *   GET    /prescriptions/:id/pdf    → PDF descargable (stream)
 *   DELETE /prescriptions/:id        → eliminar receta
 */
@UseGuards(SubscriptionGuard)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(
    private readonly prescriptions: PrescriptionsService,
    private readonly pdf: PrescriptionPdfService,
  ) {}

  private ctx(tenantId: string, userId: string, role: string): RequesterContext {
    return { tenantId, userId, role: role as RequesterContext['role'] };
  }

  @Get(':id')
  @Roles('ADMIN', 'DOCTOR')
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
  ) {
    const data = await this.prescriptions.findById(this.ctx(tenantId, userId, role), id);
    return { success: true, data };
  }

  @Get(':id/pdf')
  @Roles('ADMIN', 'DOCTOR')
  async downloadPdf(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.pdf.generate(this.ctx(tenantId, userId, role), id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Delete(':id')
  @Roles('ADMIN', 'DOCTOR')
  async remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
  ) {
    const data = await this.prescriptions.remove(this.ctx(tenantId, userId, role), id);
    return { success: true, data };
  }
}
