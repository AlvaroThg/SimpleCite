import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { CreateClinicalNoteDto } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';
import type { RequesterContext } from './patients.service';

/**
 * Notas clínicas (EHR). Creación gobernada por rol:
 *   - ADMIN y DOCTOR pueden escribir notas.
 *   - STAFF NO puede escribir contenido clínico.
 * El autor (doctorId) es siempre el usuario autenticado.
 */
@Injectable()
export class ClinicalNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async create(ctx: RequesterContext, patientId: string, dto: CreateClinicalNoteDto) {
    if (ctx.role === 'STAFF') {
      throw new ForbiddenException('El personal de recepción no puede escribir notas clínicas');
    }

    // El paciente debe pertenecer al tenant (protección cross-tenant).
    const patient = await this.prisma.client.patient.findFirst({
      where: { id: patientId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    // Si se asocia a una cita, validar que sea del paciente y del tenant.
    if (dto.appointmentId) {
      const appt = await this.prisma.client.appointment.findFirst({
        where: { id: dto.appointmentId, tenantId: ctx.tenantId, patientId },
        select: { id: true },
      });
      if (!appt) {
        throw new BadRequestException('La cita no corresponde a este paciente');
      }
    }

    const note = await this.prisma.client.medicalNote.create({
      data: {
        tenantId: ctx.tenantId,
        patientId,
        doctorId: ctx.userId, // autor
        appointmentId: dto.appointmentId ?? null,
        content: dto.content,
        visibility: 'PRIVATE',
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        appointmentId: true,
        doctor: { select: { id: true, name: true } },
      },
    });

    this.logger.log(
      {
        event: 'ehr.note.created',
        tenantId: ctx.tenantId,
        patientId,
        authorId: ctx.userId,
        noteId: note.id,
      },
      'ClinicalNotesService',
    );

    return note;
  }
}
