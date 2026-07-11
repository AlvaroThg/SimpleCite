import { randomBytes } from 'node:crypto';
import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { CreateAppointmentDto, AppointmentStatus } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';
import { MESSAGING_SERVICE, type IMessagingService } from '../../../messaging/messaging.port';

/**
 * Genera un token de cancelación opaco (32 bytes → 64 hex chars).
 * Suficiente entropía para usarse como secreto en un magic link público.
 */
export function generateCancellationToken(): string {
  return randomBytes(32).toString('hex');
}

/** Estados desde los que una cita activa puede cancelarse (libera el slot). */
const CANCELLABLE_STATUSES: AppointmentStatus[] = ['TENTATIVE', 'PENDING_PAYMENT', 'CONFIRMED'];

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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MESSAGING_SERVICE) private readonly messaging: IMessagingService,
    private readonly logger: Logger,
  ) {}

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
        select: { id: true, customPrice: true, service: { select: { price: true } } },
      }),
    ]);
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    if (!doctor) throw new NotFoundException('Doctor no encontrado o inactivo');
    if (!doctorService) {
      throw new BadRequestException('Este doctor no ofrece el servicio solicitado');
    }
    // Congela el monto cobrado: override del doctor ?? precio del servicio.
    const price = doctorService.customPrice ?? doctorService.service.price;

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (start < new Date()) {
      throw new BadRequestException('No se pueden crear citas en el pasado');
    }

    const paymentMethod = dto.paymentMethod ?? 'CASH';
    // INSURANCE se confirma directo (no hay cobro que aprobar); QR queda
    // pendiente de pago; efectivo se confirma (walk-in del staff).
    const status = paymentMethod === 'STATIC_QR' ? 'PENDING_PAYMENT' : 'CONFIRMED';

    // Modo seguro (Addendum G): validar que el seguro está activo y asignado
    // al doctor, y congelar el nombre (snapshot inmutable para reportes/PDFs).
    let insuranceData: { tenantInsuranceId: string; insuranceNameSnapshot: string } | null = null;
    if (paymentMethod === 'INSURANCE') {
      const insurance = await this.prisma.client.tenantInsurance.findFirst({
        where: {
          id: dto.tenantInsuranceId,
          tenantId,
          isActive: true,
          doctorAssignments: { some: { doctorId: dto.doctorId, isActive: true } },
        },
        select: { id: true, name: true },
      });
      if (!insurance) {
        throw new BadRequestException('Seguro no válido para este especialista');
      }
      insuranceData = { tenantInsuranceId: insurance.id, insuranceNameSnapshot: insurance.name };
    }

    try {
      const appointment = await this.prisma.client.appointment.create({
        data: {
          tenantId,
          patientId: dto.patientId,
          doctorId: dto.doctorId,
          serviceId: dto.serviceId,
          startTime: start,
          endTime: end,
          paymentMethod,
          status,
          price,
          cancellationToken: generateCancellationToken(),
          ...(insuranceData ?? {}),
        },
        include: {
          patient: { select: { phone: true, name: true } },
          doctor: { select: { name: true } },
          tenant: { select: { mapsUrl: true, timezone: true } },
        },
      });

      // Confirmación por el canal de mensajería activo (Telegram en pruebas /
      // WhatsApp en prod). Best-effort y no bloqueante: solo para citas ya
      // CONFIRMED (CASH); un fallo nunca rompe la creación de la cita.
      if (appointment.status === 'CONFIRMED' && appointment.cancellationToken) {
        void this.messaging
          .sendAppointmentConfirmation(
            appointment.patient.phone,
            appointment.patient.name,
            appointment.doctor.name,
            appointment.startTime,
            appointment.cancellationToken,
            { mapsUrl: appointment.tenant.mapsUrl, timezone: appointment.tenant.timezone },
          )
          .catch((err) =>
            this.logger.error(
              { event: 'appointment.confirm-msg.failed', err: (err as Error).message },
              'AppointmentsService',
            ),
          );
      }

      return appointment;
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
    // Ventana por defecto cuando no se pide un rango explícito: últimos 30 días
    // + próximos 15. Evita que el panel cargue TODO el historial del tenant en
    // cada request a medida que crece. El historial completo sale por Reportes
    // (analytics con rango + export CSV). El historial por paciente pasa su
    // propio rango, así que no lo afecta.
    const hasExplicitRange = !!(filters.from || filters.to || filters.patientId);
    const defaultFrom = new Date(Date.now() - 30 * 86_400_000);
    const defaultTo = new Date(Date.now() + 15 * 86_400_000);

    return this.prisma.client.appointment.findMany({
      where: {
        tenantId,
        ...(filters.doctorId && { doctorId: filters.doctorId }),
        ...(filters.patientId && { patientId: filters.patientId }),
        ...(filters.status && { status: filters.status }),
        ...(hasExplicitRange
          ? (filters.from || filters.to) && {
              startTime: {
                ...(filters.from && { gte: filters.from }),
                ...(filters.to && { lte: filters.to }),
              },
            }
          : { startTime: { gte: defaultFrom, lte: defaultTo } }),
      },
      include: {
        patient: { select: { id: true, name: true, phone: true, ci: true } },
        doctor: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, duration: true, price: true, color: true } },
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
        `Transición inválida: ${current.status} → ${nextStatus}. Permitidas: ${allowed.join(', ') || '(estado terminal)'}`,
      );
    }

    const updated = await this.prisma.client.appointment.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(nextStatus === 'CONFIRMED' && { isPaid: true }),
      },
      include: {
        patient: { select: { phone: true, name: true } },
        doctor: { select: { name: true } },
        tenant: { select: { mapsUrl: true, timezone: true } },
      },
    });

    // El staff confirmó (típicamente tras revisar un comprobante QR): avisar
    // al paciente por el canal de mensajería. Best-effort, nunca rompe la
    // transición — el paciente del panel puede no tener chat asociado.
    if (nextStatus === 'CONFIRMED' && updated.cancellationToken) {
      void this.messaging
        .sendAppointmentConfirmation(
          updated.patient.phone,
          updated.patient.name,
          updated.doctor.name,
          updated.startTime,
          updated.cancellationToken,
          { mapsUrl: updated.tenant.mapsUrl, timezone: updated.tenant.timezone },
        )
        .catch((err) =>
          this.logger.error(
            { event: 'appointment.confirm-msg.failed', id, err: (err as Error).message },
            'AppointmentsService',
          ),
        );
    }

    return updated;
  }

  /**
   * Cancela una cita a partir de su token de magic link (flujo público, sin auth).
   * El token es el secreto: identifica unívocamente la cita en cualquier tenant.
   *
   * - Idempotente: si la cita ya está CANCELLED, devuelve OK sin error (el paciente
   *   puede abrir el link dos veces).
   * - Estados terminales (COMPLETED / NO_SHOW) no se pueden cancelar.
   * - Al pasar a CANCELLED el slot se libera solo (el exclusion constraint solo
   *   bloquea TENTATIVE/PENDING_PAYMENT/CONFIRMED).
   */
  async cancelByToken(token: string) {
    const appointment = await this.prisma.client.appointment.findUnique({
      where: { cancellationToken: token },
      select: {
        id: true,
        status: true,
        startTime: true,
        tenant: { select: { name: true } },
        doctor: { select: { name: true } },
        service: { select: { name: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Enlace de cancelación inválido o expirado');

    const summary = {
      startTime: appointment.startTime,
      tenantName: appointment.tenant.name,
      doctorName: appointment.doctor.name,
      serviceName: appointment.service.name,
    };

    if (appointment.status === 'CANCELLED') {
      return { ...summary, status: 'CANCELLED' as const, alreadyCancelled: true };
    }
    if (!CANCELLABLE_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(
        'Esta cita ya no se puede cancelar (ya fue atendida o cerrada). Contacta a la clínica.',
      );
    }

    await this.prisma.client.appointment.update({
      where: { id: appointment.id },
      // expiresAt:null por si era TENTATIVE; el slot queda libre por el constraint.
      data: { status: 'CANCELLED', expiresAt: null },
    });

    return { ...summary, status: 'CANCELLED' as const, alreadyCancelled: false };
  }

  /**
   * Reprograma una cita (cambia start/end) — drag&drop / resize del calendario.
   * Solo para citas activas (no terminales). El solape con otra cita del mismo
   * doctor lo bloquea el exclusion constraint de Postgres → 409.
   */
  async reschedule(
    tenantId: string,
    id: string,
    dto: { startTime: string; endTime: string },
    requester?: { userId: string; role: string },
  ) {
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (start < new Date()) {
      throw new BadRequestException('No se puede reprogramar una cita al pasado');
    }

    const current = await this.prisma.client.appointment.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, doctorId: true },
    });
    if (!current) throw new NotFoundException('Cita no encontrada');

    // Un DOCTOR solo reprograma sus propias citas (defensa en profundidad).
    if (requester?.role === 'DOCTOR' && current.doctorId !== requester.userId) {
      throw new BadRequestException('No puedes reprogramar citas de otro doctor');
    }

    if (!CANCELLABLE_STATUSES.includes(current.status)) {
      throw new BadRequestException(`No se puede reprogramar una cita en estado ${current.status}`);
    }

    try {
      return await this.prisma.client.appointment.update({
        where: { id },
        data: { startTime: start, endTime: end },
      });
    } catch (e: unknown) {
      if (this.isExclusionViolation(e)) {
        throw new ConflictException('El doctor ya tiene una cita en ese horario. Elige otro.');
      }
      throw e;
    }
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
