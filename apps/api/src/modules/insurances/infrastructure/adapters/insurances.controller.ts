import { Controller, Get, Post, Patch, Put, Body, Param, UseGuards } from '@nestjs/common';
import {
  CreateTenantInsuranceSchema,
  UpdateTenantInsuranceSchema,
  SetDoctorInsuranceSchema,
  type CreateTenantInsuranceDto,
  type UpdateTenantInsuranceDto,
  type SetDoctorInsuranceDto,
} from '@simplecite/shared';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { SubscriptionGuard } from '../../../billing/infrastructure/guards/subscription.guard';
import { InsurancesService } from '../../application/services/insurances.service';

/**
 * Seguros médicos (panel).
 *   GET   /tenant-insurances                      → catálogo (ADMIN/STAFF/DOCTOR)
 *   POST  /tenant-insurances                      → alta (ADMIN)
 *   PATCH /tenant-insurances/:id                  → editar / archivar soft (ADMIN)
 *   GET   /doctors/:doctorId/insurances (panel)   → catálogo + asignación del doctor
 *   PUT   /doctors/:doctorId/insurances           → marcar/desmarcar (ADMIN)
 */
@UseGuards(SubscriptionGuard)
@Controller()
export class InsurancesController {
  constructor(private readonly insurances: InsurancesService) {}

  @Get('tenant-insurances')
  @Roles('ADMIN', 'DOCTOR', 'STAFF')
  async list(@CurrentUser('tenantId') tenantId: string) {
    const data = await this.insurances.list(tenantId);
    return { success: true, data };
  }

  @Post('tenant-insurances')
  @Roles('ADMIN')
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(CreateTenantInsuranceSchema)) dto: CreateTenantInsuranceDto,
  ) {
    const data = await this.insurances.create(tenantId, dto);
    return { success: true, data };
  }

  @Patch('tenant-insurances/:id')
  @Roles('ADMIN')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTenantInsuranceSchema)) dto: UpdateTenantInsuranceDto,
  ) {
    const data = await this.insurances.update(tenantId, id, dto);
    return { success: true, data };
  }

  @Get('doctors/:doctorId/insurances')
  @Roles('ADMIN', 'DOCTOR', 'STAFF')
  async listForDoctor(
    @CurrentUser('tenantId') tenantId: string,
    @Param('doctorId') doctorId: string,
  ) {
    const data = await this.insurances.listForDoctor(tenantId, doctorId);
    return { success: true, data };
  }

  @Put('doctors/:doctorId/insurances')
  @Roles('ADMIN')
  async setForDoctor(
    @CurrentUser('tenantId') tenantId: string,
    @Param('doctorId') doctorId: string,
    @Body(new ZodValidationPipe(SetDoctorInsuranceSchema)) dto: SetDoctorInsuranceDto,
  ) {
    const data = await this.insurances.setForDoctor(tenantId, doctorId, dto);
    return { success: true, data };
  }
}
