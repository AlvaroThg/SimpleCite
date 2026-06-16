import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { UpsertMedicalRecordDto, UserRole } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';

/** Contexto del solicitante autenticado (derivado del JWT). */
export interface RequesterContext {
  tenantId: string;
  userId: string;
  role: UserRole;
}

/**
 * Historia clínica estructurada (EHR) por cita. Gobernada por rol:
 *   - ADMIN y DOCTOR pueden leer y escribir.
 *   - STAFF (recepción) NO accede a contenido clínico.
 *   - Un DOCTOR solo accede a las historias de SUS citas (defensa en profundidad).
 */
@Injectable()
export class MedicalRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  /** El contenido clínico solo lo ven/escriben ADMIN y DOCTOR. */
  private assertClinicalRole(ctx: RequesterContext) {
    if (ctx.role === 'STAFF') {
      throw new ForbiddenException('El personal de recepción no accede al historial clínico');
    }
  }

  /**
   * Valida que la cita pertenece al tenant y, si el solicitante es DOCTOR,
   * que es el doctor asignado. Devuelve los datos mínimos de la cita.
   */
  private async assertAppointmentAccess(ctx: RequesterContext, appointmentId: string) {
    const appt = await this.prisma.client.appointment.findFirst({
      where: { id: appointmentId, tenantId: ctx.tenantId },
      select: { id: true, patientId: true, doctorId: true },
    });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (ctx.role === 'DOCTOR' && appt.doctorId !== ctx.userId) {
      throw new ForbiddenException('No tienes acceso a esta cita');
    }
    return appt;
  }

  /** Historia clínica de una cita (o null si aún no se creó). */
  async getByAppointment(ctx: RequesterContext, appointmentId: string) {
    this.assertClinicalRole(ctx);
    await this.assertAppointmentAccess(ctx, appointmentId);

    return this.prisma.client.medicalRecord.findUnique({
      where: { appointmentId },
      include: {
        doctor: { select: { id: true, name: true } },
        prescriptions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            medications: true,
            instructions: true,
            createdAt: true,
          },
        },
      },
    });
  }

  /**
   * Crea o actualiza la historia clínica de una cita (upsert por appointmentId 1-1).
   * El autor (doctorId) es siempre el usuario que escribe.
   */
  async upsert(ctx: RequesterContext, appointmentId: string, dto: UpsertMedicalRecordDto) {
    this.assertClinicalRole(ctx);
    const appt = await this.assertAppointmentAccess(ctx, appointmentId);

    const record = await this.prisma.client.medicalRecord.upsert({
      where: { appointmentId },
      create: {
        appointmentId,
        patientId: appt.patientId,
        doctorId: ctx.userId,
        tenantId: ctx.tenantId,
        symptoms: dto.symptoms ?? null,
        diagnosis: dto.diagnosis ?? null,
        treatment: dto.treatment ?? null,
        privateNotes: dto.privateNotes ?? null,
      },
      update: {
        // Solo sobreescribe los campos presentes en el DTO.
        ...(dto.symptoms !== undefined && { symptoms: dto.symptoms }),
        ...(dto.diagnosis !== undefined && { diagnosis: dto.diagnosis }),
        ...(dto.treatment !== undefined && { treatment: dto.treatment }),
        ...(dto.privateNotes !== undefined && { privateNotes: dto.privateNotes }),
      },
    });

    this.logger.log(
      {
        event: 'ehr.record.upserted',
        tenantId: ctx.tenantId,
        appointmentId,
        recordId: record.id,
        authorId: ctx.userId,
      },
      'MedicalRecordsService',
    );

    return record;
  }
}
