import { Controller, Get, Put, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  UpsertMedicalRecordSchema,
  CreatePrescriptionSchema,
  type UpsertMedicalRecordDto,
  type CreatePrescriptionDto,
} from '@simplecite/shared';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { SubscriptionGuard } from '../../../billing/infrastructure/guards/subscription.guard';
import {
  MedicalRecordsService,
  type RequesterContext,
} from '../../application/services/medical-records.service';
import { PrescriptionsService } from '../../application/services/prescriptions.service';

/**
 * Historia clínica (1-1 con la cita) y sus recetas. Panel staff/doctor.
 *
 *   GET  /appointments/:appointmentId/medical-record       → historia (o null)
 *   PUT  /appointments/:appointmentId/medical-record       → crear/actualizar
 *   POST /medical-records/:recordId/prescriptions          → crear receta
 *   GET  /medical-records/:recordId/prescriptions          → listar recetas
 *
 * Requiere suscripción vigente (402 si vencida), igual que el resto del panel.
 */
@UseGuards(SubscriptionGuard)
@Controller()
export class MedicalRecordsController {
  constructor(
    private readonly records: MedicalRecordsService,
    private readonly prescriptions: PrescriptionsService,
  ) {}

  private ctx(tenantId: string, userId: string, role: string): RequesterContext {
    return { tenantId, userId, role: role as RequesterContext['role'] };
  }

  @Get('appointments/:appointmentId/medical-record')
  @Roles('ADMIN', 'DOCTOR')
  async getByAppointment(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Param('appointmentId') appointmentId: string,
  ) {
    const data = await this.records.getByAppointment(
      this.ctx(tenantId, userId, role),
      appointmentId,
    );
    return { success: true, data };
  }

  @Put('appointments/:appointmentId/medical-record')
  @Roles('ADMIN', 'DOCTOR')
  async upsert(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Param('appointmentId') appointmentId: string,
    @Body(new ZodValidationPipe(UpsertMedicalRecordSchema)) dto: UpsertMedicalRecordDto,
  ) {
    const data = await this.records.upsert(this.ctx(tenantId, userId, role), appointmentId, dto);
    return { success: true, data };
  }

  @Post('medical-records/:recordId/prescriptions')
  @Roles('ADMIN', 'DOCTOR')
  async createPrescription(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Param('recordId') recordId: string,
    @Body(new ZodValidationPipe(CreatePrescriptionSchema)) dto: CreatePrescriptionDto,
  ) {
    const data = await this.prescriptions.create(this.ctx(tenantId, userId, role), recordId, dto);
    return { success: true, data };
  }

  @Get('medical-records/:recordId/prescriptions')
  @Roles('ADMIN', 'DOCTOR')
  async listPrescriptions(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Param('recordId') recordId: string,
  ) {
    const data = await this.prescriptions.listByRecord(this.ctx(tenantId, userId, role), recordId);
    return { success: true, data };
  }
}
