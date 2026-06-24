import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  CreateClinicalNoteSchema,
  CreatePatientSchema,
  PatientHistoryQuerySchema,
  PatientListQuerySchema,
  type CreateClinicalNoteDto,
  type CreatePatientDto,
  type PatientHistoryQueryDto,
  type PatientListQueryDto,
} from '@simplecite/shared';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import {
  PatientsService,
  type RequesterContext,
} from '../../application/services/patients.service';
import { ClinicalNotesService } from '../../application/services/clinical-notes.service';

/**
 * API de pacientes e historial clínico (panel staff/doctor).
 *
 * Rutas autenticadas (JWT global). El tenantId/role/userId vienen del JWT
 * vía @CurrentUser — fuente de verdad del aislamiento (no spoofeables).
 *
 *   GET  /patients                 → listado paginado (ADMIN/DOCTOR/STAFF)
 *   GET  /patients/:id/history      → citas + notas (notas filtradas por rol)
 *   POST /patients/:id/notes        → crear nota clínica (ADMIN/DOCTOR)
 */
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly notes: ClinicalNotesService,
  ) {}

  private ctx(tenantId: string, userId: string, role: string): RequesterContext {
    return { tenantId, userId, role: role as RequesterContext['role'] };
  }

  @Get()
  @Roles('ADMIN', 'DOCTOR', 'STAFF')
  async list(
    @CurrentUser('tenantId') tenantId: string,
    @Query(new ZodValidationPipe(PatientListQuerySchema)) query: PatientListQueryDto,
  ) {
    const page = await this.patients.list(tenantId, query);
    return { success: true, ...page };
  }

  @Post()
  @Roles('ADMIN', 'DOCTOR', 'STAFF')
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(CreatePatientSchema)) dto: CreatePatientDto,
  ) {
    const patient = await this.patients.createFromPanel(tenantId, dto);
    return { success: true, data: patient };
  }

  @Get(':id/history')
  @Roles('ADMIN', 'DOCTOR', 'STAFF')
  async history(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') patientId: string,
    @Query(new ZodValidationPipe(PatientHistoryQuerySchema)) query: PatientHistoryQueryDto,
  ) {
    const data = await this.patients.getHistory(this.ctx(tenantId, userId, role), patientId, query);
    return { success: true, data };
  }

  @Post(':id/notes')
  @Roles('ADMIN', 'DOCTOR')
  async createNote(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') patientId: string,
    @Body(new ZodValidationPipe(CreateClinicalNoteSchema)) dto: CreateClinicalNoteDto,
  ) {
    const note = await this.notes.create(this.ctx(tenantId, userId, role), patientId, dto);
    return { success: true, data: note };
  }
}
