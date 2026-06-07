import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import {
  CreateAppointmentSchema,
  UpdateAppointmentStatusSchema,
  AppointmentStatus,
  type CreateAppointmentDto,
  type UpdateAppointmentStatusDto,
} from '@simplecite/shared';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { SubscriptionGuard } from '../../../billing/infrastructure/guards/subscription.guard';
import { AppointmentsService } from '../../application/services/appointments.service';

// Toda la gestión de citas requiere suscripción vigente (402 si vencida).
@UseGuards(SubscriptionGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Roles('ADMIN', 'STAFF', 'DOCTOR')
  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(CreateAppointmentSchema)) dto: CreateAppointmentDto,
  ) {
    const appointment = await this.appointmentsService.create(tenantId, dto);
    return { success: true, data: appointment };
  }

  @Get()
  async list(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Query('doctorId') doctorId?: string,
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // Si es DOCTOR, restringir a sus propias citas (defensa-en-profundidad)
    const effectiveDoctorId = user.role === 'DOCTOR' ? user.sub : doctorId;

    const statusParsed = status ? AppointmentStatus.parse(status) : undefined;

    const appointments = await this.appointmentsService.findAll(tenantId, {
      doctorId: effectiveDoctorId,
      patientId,
      status: statusParsed,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return { success: true, data: appointments };
  }

  @Get(':id')
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Param('id') id: string,
  ) {
    const appointment = await this.appointmentsService.findById(tenantId, id);
    // Doctor solo ve sus citas; el guard a nivel ORM ya filtra por tenant
    if (user.role === 'DOCTOR' && appointment.doctorId !== user.sub) {
      return { success: false, error: 'No tienes acceso a esta cita' };
    }
    return { success: true, data: appointment };
  }

  @Roles('ADMIN', 'STAFF', 'DOCTOR')
  @Patch(':id/status')
  async transitionStatus(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAppointmentStatusSchema)) dto: UpdateAppointmentStatusDto,
  ) {
    const appointment = await this.appointmentsService.transitionStatus(tenantId, id, dto.status);
    return { success: true, data: appointment };
  }
}
