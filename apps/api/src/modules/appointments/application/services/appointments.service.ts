import { randomBytes, randomUUID } from 'node:crypto';
import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { toZonedTime } from 'date-fns-tz';
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

/**
 * Fechas de un tratamiento recurrente, incluida la primera.
 *
 * La cita ancla (`start`) siempre entra, aunque su día no esté marcado: es la
 * fecha que el usuario eligió a mano. A partir del día siguiente se avanza día
 * a día tomando los que caen en `weekdays`, conservando la hora.
 *
 * Se suman días en milisegundos porque Bolivia no tiene horario de verano; si
 * algún día se opera en un país con DST, esto debe pasar a aritmética zonal.
 */
export function occurrenceDates(
  start: Date,
  recurrence: { weekdays: number[]; count?: number; until?: string },
): Date[] {
  const DAY_MS = 86_400_000;
  const limit = recurrence.count ?? 60;
  const until = recurrence.until ? new Date(recurrence.until) : null;
  const days = new Set(recurrence.weekdays);

  const out: Date[] = [start];
  // Tope de barrido: un año. Evita girar sin fin si `until` queda muy lejos y
  // los días marcados nunca alcanzan el `count`.
  for (let i = 1; i <= 366 && out.length < limit; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    if (until && d > until) break;
    if (days.has(d.getDay())) out.push(d);
  }
  return out;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MESSAGING_SERVICE) private readonly messaging: IMessagingService,
    private readonly logger: Logger,
  ) {}

  async create(
    tenantId: string,
    dto: CreateAppointmentDto,
    requester?: { userId: string; role: string },
  ) {
    // Un doctor solo agenda en SU propia agenda: elegir a otro doctor es cosa
    // de admin/recepción (el select del panel también lo bloquea, esto cubre
    // llamadas directas al API).
    if (requester?.role === 'DOCTOR' && dto.doctorId !== requester.userId) {
      throw new BadRequestException('Un doctor solo puede crear citas en su propia agenda');
    }

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

    // Tratamiento recurrente: las validaciones de arriba (paciente, doctor,
    // servicio, precio, seguro) valen para toda la serie, así que se hacen una
    // sola vez y a partir de aquí solo cambia la fecha de cada sesión.
    if (dto.recurrence) {
      return await this.createRecurring(tenantId, {
        base: {
          patientId: dto.patientId,
          doctorId: dto.doctorId,
          serviceId: dto.serviceId,
          paymentMethod,
          status,
          price,
          insuranceData,
        },
        start,
        end,
        recurrence: dto.recurrence,
      });
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
      // CONFIRMED (CASH); un fallo nunca rompe la creación de la cita. Un
      // paciente registrado solo con CI no tiene a dónde recibirla.
      if (
        appointment.status === 'CONFIRMED' &&
        appointment.cancellationToken &&
        appointment.patient.phone
      ) {
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
    // + próximos 120. Evita que el panel cargue TODO el historial del tenant en
    // cada request a medida que crece. El historial completo sale por Reportes
    // (analytics con rango + export CSV). El historial por paciente pasa su
    // propio rango, así que no lo afecta.
    //
    // Los +15 originales se quedaban cortos: una cita reservada a 3 semanas
    // (el bot permite hasta 30 días) desaparecía de la lista y del calendario,
    // y solo se veía entrando al paciente. El calendario además pide su rango
    // visible explícito, así que esto es la red de seguridad de la lista.
    const hasExplicitRange = !!(filters.from || filters.to || filters.patientId);
    const defaultFrom = new Date(Date.now() - 30 * 86_400_000);
    const defaultTo = new Date(Date.now() + 120 * 86_400_000);

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

    // Cita de un tratamiento: su posición dentro de la serie ("Sesión 3 de
    // 10"). Se calcula al vuelo contando las citas de la serie, por eso la
    // serie no necesita tabla propia.
    if (appointment.seriesId) {
      const siblings = await this.prisma.client.appointment.findMany({
        where: { tenantId, seriesId: appointment.seriesId },
        select: { id: true },
        orderBy: { startTime: 'asc' },
      });
      const index = siblings.findIndex((s) => s.id === appointment.id);
      return {
        ...appointment,
        session: { index: index + 1, total: siblings.length },
      };
    }
    return appointment;
  }

  async transitionStatus(
    tenantId: string,
    id: string,
    nextStatus: AppointmentStatus,
    opts?: { force?: boolean },
  ) {
    const current = await this.prisma.client.appointment.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        isPaid: true,
        receiptUrl: true,
        paymentMethod: true,
        medicalRecord: { select: { id: true } },
      },
    });
    if (!current) throw new NotFoundException('Cita no encontrada');

    const allowed = ALLOWED_TRANSITIONS[current.status];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `Transición inválida: ${current.status} → ${nextStatus}. Permitidas: ${allowed.join(', ') || '(estado terminal)'}`,
      );
    }

    // Dar por atendida una cita sin historia clínica pierde el registro de lo
    // que se hizo. Se exige pasar por la consulta; el panel puede forzarlo
    // (con confirmación) para las citas que no la llevan.
    if (nextStatus === 'COMPLETED' && !current.medicalRecord && !opts?.force) {
      throw new BadRequestException(
        'Esta cita todavía no tiene una consulta registrada. Inicia la consulta antes de marcarla como completada.',
      );
    }

    // Cancelar una cita PAGADA deja el dinero pendiente de resolución (el QR
    // no se puede revertir): el reporte la muestra hasta que el staff registre
    // devolución o saldo a favor.
    const cancelledPaid =
      nextStatus === 'CANCELLED' &&
      (current.isPaid || Boolean(current.receiptUrl)) &&
      current.paymentMethod !== 'INSURANCE';

    const updated = await this.prisma.client.appointment.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(nextStatus === 'CONFIRMED' && { isPaid: true }),
        ...(cancelledPaid && { refundResolution: 'PENDING' }),
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
    if (nextStatus === 'CONFIRMED' && updated.cancellationToken && updated.patient.phone) {
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
   * El staff registra que la cita ya fue pagada en la clínica (efectivo o QR
   * mostrado físicamente). Pensado para clínicas con el módulo de pagos
   * apagado, donde el cobro ocurre en recepción antes de la sesión.
   */
  async markPaid(tenantId: string, id: string, method: 'CASH' | 'STATIC_QR') {
    const current = await this.prisma.client.appointment.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, isPaid: true, paymentMethod: true },
    });
    if (!current) throw new NotFoundException('Cita no encontrada');
    if (current.paymentMethod === 'INSURANCE') {
      throw new BadRequestException('Las citas por seguro no registran cobro al paciente');
    }
    if (current.isPaid) {
      throw new BadRequestException('Esta cita ya está marcada como pagada');
    }
    if (!['CONFIRMED', 'COMPLETED', 'PENDING_PAYMENT'].includes(current.status)) {
      throw new BadRequestException('Solo se puede registrar el pago de citas activas');
    }

    return this.prisma.client.appointment.update({
      where: { id },
      data: {
        isPaid: true,
        paymentMethod: method,
        // Registrar el pago de una PENDING_PAYMENT también la confirma.
        ...(current.status === 'PENDING_PAYMENT' && { status: 'CONFIRMED' }),
      },
    });
  }

  /**
   * Registra qué hizo la clínica con el dinero de una cita pagada que se
   * canceló: lo devolvió (fuera del sistema) o quedó como saldo a favor.
   * Se puede corregir (REFUNDED ↔ CREDITED) mientras exista la resolución.
   */
  async setRefundResolution(tenantId: string, id: string, resolution: 'REFUNDED' | 'CREDITED') {
    const current = await this.prisma.client.appointment.findFirst({
      where: { id, tenantId, status: 'CANCELLED', refundResolution: { not: null } },
      select: { id: true },
    });
    if (!current) {
      throw new NotFoundException('Esta cita no tiene un pago cancelado por resolver');
    }
    return this.prisma.client.appointment.update({
      where: { id },
      data: { refundResolution: resolution },
    });
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
        isPaid: true,
        receiptUrl: true,
        paymentMethod: true,
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

    // Cita pagada: el dinero queda pendiente de resolución (ver reportes).
    const cancelledPaid =
      (appointment.isPaid || Boolean(appointment.receiptUrl)) &&
      appointment.paymentMethod !== 'INSURANCE';
    await this.prisma.client.appointment.update({
      where: { id: appointment.id },
      // expiresAt:null por si era TENTATIVE; el slot queda libre por el constraint.
      data: {
        status: 'CANCELLED',
        expiresAt: null,
        ...(cancelledPaid && { refundResolution: 'PENDING' }),
      },
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

    await this.assertWithinDoctorSchedule(tenantId, current.doctorId, start, end);

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

  /**
   * Crea el tratamiento completo: una cita por fecha de la serie.
   *
   * Cada sesión se intenta por separado a propósito. Si una choca con otra cita
   * del doctor o cae fuera de su horario, se OMITE y se informa cuál — nunca se
   * pisa una cita existente ni se cae toda la serie por un solo conflicto.
   * Tampoco va en una transacción única: perder 9 sesiones válidas porque la
   * décima chocaba sería peor para la recepción que crear las 9.
   */
  private async createRecurring(
    tenantId: string,
    params: {
      base: {
        patientId: string;
        doctorId: string;
        serviceId: string;
        paymentMethod: string;
        status: string;
        price: unknown;
        insuranceData: { tenantInsuranceId: string; insuranceNameSnapshot: string } | null;
      };
      start: Date;
      end: Date;
      recurrence: { weekdays: number[]; count?: number; until?: string };
    },
  ) {
    const { base, start, end, recurrence } = params;
    const seriesId = randomUUID();
    const durationMs = end.getTime() - start.getTime();
    const dates = occurrenceDates(start, recurrence);

    const created: { id: string; startTime: Date }[] = [];
    const skipped: { startTime: Date; reason: string }[] = [];

    for (const occStart of dates) {
      const occEnd = new Date(occStart.getTime() + durationMs);
      try {
        await this.assertWithinDoctorSchedule(tenantId, base.doctorId, occStart, occEnd);
        const appt = await this.prisma.client.appointment.create({
          data: {
            tenantId,
            patientId: base.patientId,
            doctorId: base.doctorId,
            serviceId: base.serviceId,
            startTime: occStart,
            endTime: occEnd,
            paymentMethod: base.paymentMethod as never,
            status: base.status as never,
            price: base.price as never,
            // Único por cita: es el magic link de cancelación de ESA sesión.
            cancellationToken: generateCancellationToken(),
            seriesId,
            ...(base.insuranceData ?? {}),
          },
          select: { id: true, startTime: true },
        });
        created.push(appt);
      } catch (e: unknown) {
        if (this.isExclusionViolation(e)) {
          skipped.push({ startTime: occStart, reason: 'El especialista ya tiene una cita' });
          continue;
        }
        if (e instanceof BadRequestException) {
          skipped.push({ startTime: occStart, reason: 'Fuera del horario de atención' });
          continue;
        }
        throw e;
      }
    }

    if (created.length === 0) {
      throw new ConflictException(
        'Ninguna de las fechas quedó libre en la agenda del especialista.',
      );
    }

    // Un solo aviso por tratamiento: mandar 10 confirmaciones al paciente por
    // la misma reserva sería spam (y consumo innecesario de WhatsApp).
    await this.notifySeriesCreated(tenantId, created[0].id, created.length);

    this.logger.log(
      {
        event: 'appointment.series.created',
        tenantId,
        seriesId,
        created: created.length,
        skipped: skipped.length,
      },
      'AppointmentsService',
    );

    const first = await this.prisma.client.appointment.findFirst({
      where: { id: created[0].id, tenantId },
    });
    return { ...first, series: { id: seriesId, created: created.length, skipped } };
  }

  /** Confirmación al paciente por el tratamiento (una sola, la de la 1ª sesión). */
  private async notifySeriesCreated(tenantId: string, appointmentId: string, total: number) {
    const appt = await this.prisma.client.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        patient: { select: { phone: true, name: true } },
        doctor: { select: { name: true } },
        tenant: { select: { mapsUrl: true, timezone: true } },
      },
    });
    if (!appt || appt.status !== 'CONFIRMED' || !appt.cancellationToken || !appt.patient.phone) {
      return;
    }
    void this.messaging
      .sendAppointmentConfirmation(
        appt.patient.phone,
        appt.patient.name,
        appt.doctor.name,
        appt.startTime,
        appt.cancellationToken,
        { mapsUrl: appt.tenant.mapsUrl, timezone: appt.tenant.timezone, totalSessions: total },
      )
      .catch((err) =>
        this.logger.error(
          { event: 'appointment.series-msg.failed', err: (err as Error).message },
          'AppointmentsService',
        ),
      );
  }

  /**
   * Exige que el rango caiga dentro del horario de atención del doctor y fuera
   * de sus bloqueos. El calendario permite soltar una cita en cualquier franja
   * (arrastrar es libre), así que sin esto se podían agendar citas a las 3 AM o
   * en el día de descanso del especialista.
   *
   * Las reglas se guardan como minutos desde medianoche EN LA ZONA DEL TENANT,
   * así que el rango se convierte antes de comparar.
   *
   * Si el doctor todavía no tiene ninguna regla cargada no se valida nada: su
   * agenda aún no está configurada y bloquear sería peor que permitir.
   */
  private async assertWithinDoctorSchedule(
    tenantId: string,
    doctorId: string,
    start: Date,
    end: Date,
  ): Promise<void> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const timezone = tenant?.timezone ?? 'America/La_Paz';

    const rules = await this.prisma.client.doctorScheduleRule.findMany({
      where: { tenantId, doctorId, isActive: true },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    });
    if (rules.length === 0) return; // agenda sin configurar

    const localStart = toZonedTime(start, timezone);
    const localEnd = toZonedTime(end, timezone);
    const startMin = localStart.getHours() * 60 + localStart.getMinutes();
    const endMin = localEnd.getHours() * 60 + localEnd.getMinutes();

    // Cita que cruza la medianoche: ninguna franja diaria puede contenerla.
    const sameDay = localStart.toDateString() === localEnd.toDateString();
    const fits =
      sameDay &&
      rules.some(
        (r) =>
          r.dayOfWeek === localStart.getDay() && startMin >= r.startMinute && endMin <= r.endMinute,
      );
    if (!fits) {
      throw new BadRequestException(
        'Ese horario está fuera del horario de atención del especialista.',
      );
    }

    const blocked = await this.prisma.client.doctorScheduleBlock.findFirst({
      where: { tenantId, doctorId, startTime: { lt: end }, endTime: { gt: start } },
      select: { id: true },
    });
    if (blocked) {
      throw new BadRequestException('El especialista tiene un bloqueo en ese horario.');
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
