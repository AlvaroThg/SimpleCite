import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import type { CreatePublicAppointmentDto, PaymentMethod } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PatientsService } from '../../../patients/application/services/patients.service';
import { WaMessageService } from '../../../whatsapp/application/services/wa-message.service';
import { generateCancellationToken } from '../../../appointments/application/services/appointments.service';

/**
 * Reserva pública de citas vía OTP.
 *
 * Flujo:
 *   1. Paciente verifica OTP → recibe sessionToken (phone+tenantId).
 *   2. Llama POST /public/tenants/:slug/appointments → crea TENTATIVE.
 *   3. (Opcional, en Fase 5) Pago → CONFIRMED via webhook.
 *      En Fase 4 saltamos pago y vamos directo a CONFIRMED en /confirm.
 *
 * El estado TENTATIVE bloquea el slot vía exclusion constraint, así que
 * dos pacientes no pueden estar en el wizard sobre la misma franja.
 */
@Injectable()
export class PublicBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly patients: PatientsService,
    private readonly waMessage: WaMessageService,
    private readonly logger: Logger,
  ) {}

  async createTentative(params: {
    tenantId: string;
    phone: string;
    dto: CreatePublicAppointmentDto;
  }): Promise<{ appointmentId: string; expiresAt: Date }> {
    const { tenantId, phone, dto } = params;

    // 1. Validar doctor + service activos en el tenant
    const [doctor, service, link] = await Promise.all([
      this.prisma.client.user.findFirst({
        where: { id: dto.doctorId, tenantId, role: 'DOCTOR', isActive: true },
        select: { id: true },
      }),
      this.prisma.client.service.findFirst({
        where: { id: dto.serviceId, tenantId, isActive: true },
        select: { id: true, duration: true },
      }),
      this.prisma.client.doctorService.findFirst({
        where: {
          doctorId: dto.doctorId,
          serviceId: dto.serviceId,
          tenantId,
          isActive: true,
        },
        select: { customDuration: true },
      }),
    ]);

    if (!doctor) throw new NotFoundException('Doctor no encontrado');
    if (!service) throw new NotFoundException('Servicio no encontrado');
    if (!link) throw new NotFoundException('El doctor no ofrece este servicio');

    const duration = link.customDuration ?? service.duration;
    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + duration * 60_000);

    if (startTime < new Date()) {
      throw new BadRequestException('No se puede reservar en el pasado');
    }

    // 2. Resolver Patient con dedupe por phone+ci normalizados (Fase 7).
    //    El phone ya pasó por OTP; findOrCreate normaliza a E.164 y deduplica.
    const patient = await this.patients.findOrCreate({
      tenantId,
      phone,
      name: dto.patient.name,
      ci: dto.patient.ci,
    });

    // 3. Crear appointment TENTATIVE con TTL
    const ttlMin = this.config.get<number>('TENTATIVE_APPOINTMENT_TTL_MINUTES') ?? 15;
    const expiresAt = new Date(Date.now() + ttlMin * 60_000);

    try {
      const appointment = await this.prisma.client.appointment.create({
        data: {
          tenantId,
          patientId: patient.id,
          doctorId: dto.doctorId,
          serviceId: dto.serviceId,
          startTime,
          endTime,
          status: 'TENTATIVE',
          expiresAt,
          cancellationToken: generateCancellationToken(),
        },
        select: { id: true, expiresAt: true },
      });

      this.logger.log(
        {
          event: 'public.appointment.tentative-created',
          tenantId,
          appointmentId: appointment.id,
          phone,
          doctorId: dto.doctorId,
          serviceId: dto.serviceId,
          startTime: dto.startTime,
        },
        'PublicBookingService',
      );

      return { appointmentId: appointment.id, expiresAt: appointment.expiresAt! };
    } catch (err) {
      if (this.isExclusionViolation(err)) {
        throw new ConflictException('Este horario ya fue reservado por otro paciente. Elige otro.');
      }
      throw err;
    }
  }

  /**
   * Confirma una cita TENTATIVE → CONFIRMED.
   *
   * Verifica:
   *   - La cita pertenece al phone de la sesión actual (no se puede confirmar
   *     citas ajenas con un token válido).
   *   - Sigue en estado TENTATIVE.
   *   - No expiró.
   *
   * En Fase 5, esta transición será TENTATIVE → PENDING_PAYMENT (con QR Simple).
   */
  async confirm(params: {
    tenantId: string;
    phone: string;
    appointmentId: string;
    paymentMethod: PaymentMethod;
  }) {
    const { tenantId, phone, appointmentId, paymentMethod } = params;

    const appointment = await this.prisma.client.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: { patient: { select: { phone: true } } },
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada');

    if (appointment.patient.phone !== phone) {
      this.logger.warn(
        {
          event: 'public.appointment.confirm.wrong-patient',
          tenantId,
          appointmentId,
          tokenPhone: phone,
          appointmentPhone: appointment.patient.phone,
        },
        'PublicBookingService',
      );
      throw new ForbiddenException('Esta reserva no te pertenece');
    }

    if (appointment.status !== 'TENTATIVE') {
      throw new BadRequestException(
        `La cita está en estado ${appointment.status}, no se puede confirmar`,
      );
    }

    if (appointment.expiresAt && appointment.expiresAt < new Date()) {
      await this.prisma.client.appointment.update({
        where: { id: appointmentId },
        data: { status: 'CANCELLED', expiresAt: null },
      });
      throw new BadRequestException('La reserva expiró. Inicia el proceso de nuevo.');
    }

    // CASH → CONFIRMED directo. STATIC_QR → PENDING_PAYMENT: el QR y el
    // comprobante se gestionan por WhatsApp (los datos del paciente ya están
    // guardados para poder confirmarlo por ese canal).
    const status = paymentMethod === 'STATIC_QR' ? 'PENDING_PAYMENT' : 'CONFIRMED';
    const updated = await this.prisma.client.appointment.update({
      where: { id: appointmentId },
      data: { status, paymentMethod, expiresAt: null },
    });

    if (paymentMethod === 'STATIC_QR') {
      // No-bloqueante: el envío del QR no debe frenar la respuesta al paciente.
      void this.sendStaticQrByWhatsApp(tenantId, phone, appointmentId);
    }

    this.logger.log(
      { event: 'public.appointment.confirmed', tenantId, appointmentId, phone, paymentMethod },
      'PublicBookingService',
    );

    return updated;
  }

  /**
   * Envía el QR bancario estático del tenant al paciente por WhatsApp y le pide
   * el comprobante. Best-effort: si no hay instancia conectada (dev), se ignora.
   */
  private async sendStaticQrByWhatsApp(tenantId: string, phone: string, appointmentId: string) {
    try {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true, staticQrUrl: true },
      });
      if (!tenant) return;

      if (tenant.staticQrUrl) {
        await this.waMessage.send({
          tenantId,
          tenantSlug: tenant.slug,
          phone,
          messageKey: `qr-booking:${appointmentId}`,
          text:
            '🎉 *Cita registrada — pendiente de pago.*\n\n' +
            'Escanea el QR que te enviamos, realiza el pago y envíanos la *foto del comprobante* ' +
            'por aquí para confirmar tu cita.',
        });
        await this.waMessage.sendImage({
          tenantId,
          tenantSlug: tenant.slug,
          phone,
          imageUrl: tenant.staticQrUrl,
          caption: '📲 Escanea este QR para realizar tu pago',
          messageKey: `qr-booking-img:${appointmentId}`,
        });
      } else {
        await this.waMessage.send({
          tenantId,
          tenantSlug: tenant.slug,
          phone,
          messageKey: `qr-booking:${appointmentId}`,
          text: 'Tu cita quedó registrada. Contacta a la clínica para coordinar el pago por QR y confirmarla.',
        });
      }
    } catch (err) {
      this.logger.warn(
        { event: 'public.booking.qr-send-failed', appointmentId, err: (err as Error).message },
        'PublicBookingService',
      );
    }
  }

  /**
   * Detecta violación del exclusion constraint anti-overlap.
   *
   * Prisma a veces devuelve `P2010` con `meta.code === '23P01'`, pero para
   * exclusion constraints frecuentemente lo envuelve como
   * `PrismaClientUnknownRequestError` con el SQLSTATE solo en el mensaje.
   * Cubrimos ambos casos buscando el SQLSTATE directamente.
   */
  private isExclusionViolation(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const e = err as { code?: string; message?: string; meta?: { code?: string } };
    if (e.code === 'P2010' && e.meta?.code === '23P01') return true;
    if (typeof e.message === 'string' && e.message.includes('23P01')) return true;
    return false;
  }
}
