import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type { CreateAppointmentDto, AppointmentStatus } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';

/**
 * Transiciones permitidas en el ciclo de vida de una cita.
 * Cualquier intento de cambio fuera de esta tabla retorna 400.
 */
const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  // TENTATIVE → confirmada por OTP (sin pago) o pendiente de pago (Fase 5),
  // o cancelada por expiración / decisión del paciente o staff.
  TENTATIVE: ['CONFIRMED', 'PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [], // terminal
  CANCELLED: [], // terminal
  NO_SHOW: [], // terminal
};

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateAppointmentDto) {
    // Validar relaciones (pertenecen al tenant + doctor ofrece el servicio)
    const [patient, doctor, doctorService] = await Promise.all([
      this.prisma.client.patient.findFirst({
        where: { id: dto.patientId, tenantId },
        select: { id: true },
      }),
      this.prisma.client.user.findFirst({
        where: { id: dto.doctorId, tenantId, role: 'DOCTOR', isActive: true },
        select: { id: true },
      }),
      this.prisma.client.doctorService.findFirst({
        where: { doctorId: dto.doctorId, serviceId: dto.serviceId, isActive: true },
        select: { id: true },
      }),
    ]);
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    if (!doctor) throw new NotFoundException('Doctor no encontrado o inactivo');
    if (!doctorService) {
      throw new BadRequestException('Este doctor no ofrece el servicio solicitado');
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (start < new Date()) {
      throw new BadRequestException('No se pueden crear citas en el pasado');
    }

    try {
      return await this.prisma.client.appointment.create({
        data: {
          tenantId,
          patientId: dto.patientId,
          doctorId: dto.doctorId,
          serviceId: dto.serviceId,
          startTime: start,
          endTime: end,
        },
      });
    } catch (e: unknown) {
      // El exclusion constraint en Postgres devuelve 23P01 (SQLSTATE).
      // Prisma lo expone como P2010 con meta.code = "23P01".
      if (this.isExclusionViolation(e)) {
        throw new ConflictException('El doctor ya tiene una cita en ese horario. Elige otro slot.');
      }
      throw e;
    }
  }

  async findAll(
    tenantId: string,
    filters: {
      doctorId?: string;
      patientId?: string;
      status?: AppointmentStatus;
      from?: Date;
      to?: Date;
    } = {},
  ) {
    return this.prisma.client.appointment.findMany({
      where: {
        tenantId,
        ...(filters.doctorId && { doctorId: filters.doctorId }),
        ...(filters.patientId && { patientId: filters.patientId }),
        ...(filters.status && { status: filters.status }),
        ...((filters.from || filters.to) && {
          startTime: {
            ...(filters.from && { gte: filters.from }),
            ...(filters.to && { lte: filters.to }),
          },
        }),
      },
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        doctor: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, duration: true, price: true } },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const appointment = await this.prisma.client.appointment.findFirst({
      where: { id, tenantId },
      include: {
        patient: { select: { id: true, name: true, phone: true, ci: true } },
        doctor: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, duration: true, price: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada');
    return appointment;
  }

  async transitionStatus(tenantId: string, id: string, nextStatus: AppointmentStatus) {
    const current = await this.prisma.client.appointment.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException('Cita no encontrada');

    const allowed = ALLOWED_TRANSITIONS[current.status];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `TransiciÃ³n invÃ¡lida: ${current.status} â†’ ${nextStatus}. Permitidas: ${allowed.join(', ') || '(estado terminal)'}`,
      );
    }

    return this.prisma.client.appointment.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(nextStatus === 'CONFIRMED' && { isPaid: true }),
      },
    });
  }

  private isExclusionViolation(e: unknown): boolean {
    if (typeof e !== 'object' || e === null) return false;
    const err = e as { code?: string; message?: string; meta?: { code?: string } };
    if (err.code === 'P2010' && err.meta?.code === '23P01') return true;
    // PrismaClientUnknownRequestError lo entrega solo en .message
    if (typeof err.message === 'string' && err.message.includes('23P01')) return true;
    return false;
  }
}
