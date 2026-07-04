import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import type { CreatePublicAppointmentDto, PaymentMethod } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';
import { TurnstileService } from '../../../../common/services/turnstile.service';
import { PatientsService } from '../../../patients/application/services/patients.service';
import { WaMessageService } from '../../../whatsapp/application/services/wa-message.service';
import { generateCancellationToken } from '../../../appointments/application/services/appointments.service';

// Anti-spam del flujo abierto (sin OTP): un mismo teléfono no puede crear más
// de N reservas por hora en la misma clínica.
const BOOKING_RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_BOOKINGS_PER_PHONE = 5;

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
    private readonly turnstile: TurnstileService,
    private readonly patients: PatientsService,
    private readonly waMessage: WaMessageService,
    private readonly logger: Logger,
  ) {}

  private get requireOtp(): boolean {
    return this.config.get<string>('PUBLIC_BOOKING_REQUIRE_OTP') === 'true';
  }

  async createTentative(params: {
    tenantId: string;
    phone: string;
    dto: CreatePublicAppointmentDto;
    remoteIp?: string;
  }): Promise<{ appointmentId: string; expiresAt: Date }> {
    const { tenantId, dto, remoteIp } = params;
    let { phone } = params;

    // Paciente regresante (lookup por CI): usa su registro existente; el phone
    // sale de la DB (no se pide de nuevo) y sirve para el rate limit.
    let returningPatient: { id: string } | null = null;
    if (dto.patientId) {
      const existing = await this.prisma.client.patient.findFirst({
        where: { id: dto.patientId, tenantId },
        select: { id: true, phone: true },
      });
      if (!existing) throw new NotFoundException('Paciente no encontrado');
      returningPatient = { id: existing.id };
      phone = existing.phone;
    }

    // 0. Modo abierto (sin OTP): anti-bot Turnstile + rate limit por teléfono.
    //    En modo OTP el JWT ya autenticó al titular, así que se omite.
    if (!this.requireOtp) {
      const ok = await this.turnstile.verify(dto.turnstileToken, remoteIp);
      if (!ok) throw new ForbiddenException('Verificación de seguridad falló. Reintenta.');
      await this.enforcePhoneRateLimit(tenantId, phone);
    }

    // 1. Validar doctor + service activos en el tenant
    const [doctor, service, link] = await Promise.all([
      this.prisma.client.user.findFirst({
        where: { id: dto.doctorId, tenantId, role: 'DOCTOR', isActive: true },
        select: { id: true },
      }),
      this.prisma.client.service.findFirst({
        where: { id: dto.serviceId, tenantId, isActive: true },
        select: { id: true, duration: true, price: true },
      }),
      this.prisma.client.doctorService.findFirst({
        where: {
          doctorId: dto.doctorId,
          serviceId: dto.serviceId,
          tenantId,
          isActive: true,
        },
        select: { customDuration: true, customPrice: true },
      }),
    ]);

    if (!doctor) throw new NotFoundException('Doctor no encontrado');
    if (!service) throw new NotFoundException('Servicio no encontrado');
    if (!link) throw new NotFoundException('El doctor no ofrece este servicio');

    const duration = link.customDuration ?? service.duration;
    // Congela el monto cobrado: override del doctor ?? precio del servicio.
    const price = link.customPrice ?? service.price;
    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + duration * 60_000);

    if (startTime < new Date()) {
      throw new BadRequestException('No se puede reservar en el pasado');
    }

    // 2. Resolver Patient: regresante (registro existente) o dedupe por
    //    phone+ci normalizados (findOrCreate normaliza a E.164 y deduplica).
    const patient =
      returningPatient ??
      (await this.patients.findOrCreate({
        tenantId,
        phone,
        name: dto.patient!.name,
        ci: dto.patient!.ci,
      }));

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
          price,
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
   * Rate limit por teléfono (modo abierto sin OTP): un mismo número no puede
   * crear más de MAX_BOOKINGS_PER_PHONE reservas por hora en la misma clínica.
   * Cuenta citas recientes del teléfono (vía relación patient.phone normalizada).
   */
  private async enforcePhoneRateLimit(tenantId: string, phone: string) {
    const since = new Date(Date.now() - BOOKING_RATE_WINDOW_MS);
    const count = await this.prisma.client.appointment.count({
      where: { tenantId, patient: { phone }, createdAt: { gte: since } },
    });
    if (count >= MAX_BOOKINGS_PER_PHONE) {
      this.logger.warn(
        { event: 'public.booking.ratelimit.phone', tenantId, phone, count },
        'PublicBookingService',
      );
      throw new HttpException(
        'Demasiadas reservas con este número. Intenta más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
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
    tenantInsuranceId?: string;
    patientId?: string;
  }) {
    const { tenantId, phone, appointmentId, paymentMethod, tenantInsuranceId, patientId } = params;

    const appointment = await this.prisma.client.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: { patient: { select: { phone: true } } },
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada');

    // Titularidad: por phone (flujo normal) o por patientId (regresante vía CI).
    const owns = patientId
      ? appointment.patientId === patientId
      : appointment.patient.phone === phone;
    if (!owns) {
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

    // ─── Modo seguro (Addendum G): auto-confirmación, sin cobro ───
    // El paciente elige con qué seguro asiste; validamos que el seguro esté
    // activo Y asignado al doctor de esta cita, congelamos el nombre
    // (insuranceNameSnapshot, inmutable) y confirmamos directo: no hay pago
    // que aprobar, así que nunca pasa por PENDING_PAYMENT.
    if (paymentMethod === 'INSURANCE') {
      const doctorProfile = await this.prisma.client.doctorProfile.findFirst({
        where: { userId: appointment.doctorId, insuranceMode: true },
        select: { id: true },
      });
      if (!doctorProfile) {
        throw new BadRequestException('Este especialista no atiende por seguro médico');
      }

      const insurance = await this.prisma.client.tenantInsurance.findFirst({
        where: {
          id: tenantInsuranceId,
          tenantId,
          isActive: true,
          doctorAssignments: { some: { doctorId: appointment.doctorId, isActive: true } },
        },
        select: { id: true, name: true },
      });
      if (!insurance) {
        throw new UnprocessableEntityException('Seguro no válido para este especialista');
      }

      const confirmed = await this.prisma.client.appointment.update({
        where: { id: appointmentId },
        data: {
          tenantInsuranceId: insurance.id,
          insuranceNameSnapshot: insurance.name, // ← inmutable desde aquí
          paymentMethod: 'INSURANCE',
          status: 'CONFIRMED',
          expiresAt: null,
        },
      });

      this.logger.log(
        {
          event: 'public.appointment.confirmed-insurance',
          tenantId,
          appointmentId,
          phone,
          insurance: insurance.name,
        },
        'PublicBookingService',
      );
      return confirmed;
    }

    // Estado tras confirmar:
    //  - Modo abierto (main, sin bot): TODA reserva pública queda PENDING_PAYMENT,
    //    incluido efectivo. El staff la pasa a CONFIRMED a mano ("Confirmar pago
    //    recibido"), evitando que una reserva no atendida bloquee el slot como
    //    CONFIRMED permanente.
    //  - Modo OTP (bot activo): efectivo → CONFIRMED directo; QR → PENDING_PAYMENT
    //    (el comprobante llega por WhatsApp).
    const status = this.requireOtp && paymentMethod === 'CASH' ? 'CONFIRMED' : 'PENDING_PAYMENT';
    const updated = await this.prisma.client.appointment.update({
      where: { id: appointmentId },
      data: { status, paymentMethod, expiresAt: null },
    });

    // Envío del QR por WhatsApp: SOLO en modo OTP (bot activo). En main el QR se
    // muestra en la propia UI de booking, sin dependencia de WhatsApp.
    if (this.requireOtp && paymentMethod === 'STATIC_QR') {
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
