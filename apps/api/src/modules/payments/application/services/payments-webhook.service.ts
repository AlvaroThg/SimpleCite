import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../../../../common/database/prisma.service';
import { WaMessageService } from '../../../whatsapp/application/services/wa-message.service';

export interface PaymentWebhookPayload {
  eventId: string;
  eventType: string; /// "payment.succeeded" | "payment.failed"
  providerPaymentId: string;
  status: 'PAID' | 'FAILED';
  paidAt?: string;
}

/**
 * Procesamiento idempotente de webhooks de pago.
 *
 * Usa `this.prisma` directamente (sin contexto tenant): el webhook es un
 * endpoint de sistema sin tenant resuelto. El tenant se deriva del intent
 * encontrado por `providerPaymentId`.
 *
 * Idempotencia en dos capas:
 *   1. `payment_events.eventId` es UNIQUE → un evento repetido falla al insertar
 *      y se trata como duplicado (no reprocesa).
 *   2. La transición de estado del intent/cita es idempotente: aplicar PAID
 *      sobre un intent ya PAID no cambia nada.
 */
@Injectable()
export class PaymentsWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waMessage: WaMessageService,
    private readonly logger: Logger,
  ) {}

  async process(
    payload: PaymentWebhookPayload,
    rawPayload: unknown,
  ): Promise<{ deduplicated: boolean }> {
    // 1. Registrar el evento (dedup por eventId). Si ya existe → replay.
    try {
      await this.prisma.paymentEvent.create({
        data: {
          eventId: payload.eventId,
          eventType: payload.eventType,
          rawPayload: rawPayload as object,
        },
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        this.logger.log(
          { event: 'payment.webhook.duplicate', eventId: payload.eventId },
          'PaymentsWebhookService',
        );
        return { deduplicated: true };
      }
      throw err;
    }

    // 2. Localizar el intent por providerPaymentId
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { providerPaymentId: payload.providerPaymentId },
    });

    if (!intent) {
      this.logger.warn(
        { event: 'payment.webhook.no-intent', providerPaymentId: payload.providerPaymentId },
        'PaymentsWebhookService',
      );
      // El evento queda registrado (sin asociar) para auditoría.
      return { deduplicated: false };
    }

    // Asociar el evento al intent + tenant ahora que lo conocemos
    await this.prisma.paymentEvent.update({
      where: { eventId: payload.eventId },
      data: { paymentIntentId: intent.id, tenantId: intent.tenantId },
    });

    // 3. Aplicar la transición idempotentemente
    if (payload.status === 'PAID') {
      await this.applyPaid(intent.id, intent.appointmentId, payload.paidAt);
      // Confirmación por WhatsApp (no-bloqueante: un fallo no afecta el webhook).
      void this.sendConfirmation(intent.appointmentId);
    } else if (payload.status === 'FAILED') {
      await this.applyFailed(intent.id);
    }

    // 4. Marcar el evento como procesado
    await this.prisma.paymentEvent.update({
      where: { eventId: payload.eventId },
      data: { processedAt: new Date() },
    });

    this.logger.log(
      {
        event: 'payment.webhook.processed',
        eventId: payload.eventId,
        intentId: intent.id,
        status: payload.status,
      },
      'PaymentsWebhookService',
    );

    return { deduplicated: false };
  }

  /**
   * Marca el intent como PAID y confirma la cita. Idempotente: si ya está
   * PAID, las actualizaciones no cambian el estado efectivo.
   */
  private async applyPaid(intentId: string, appointmentId: string, paidAtStr?: string) {
    const paidAt = paidAtStr ? new Date(paidAtStr) : new Date();

    // Una transacción para mantener intent + cita consistentes.
    await this.prisma.$transaction([
      this.prisma.paymentIntent.update({
        where: { id: intentId },
        data: { status: 'PAID', paidAt },
      }),
      this.prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'CONFIRMED', isPaid: true, expiresAt: null },
      }),
    ]);
  }

  private async applyFailed(intentId: string) {
    await this.prisma.paymentIntent.update({
      where: { id: intentId },
      data: { status: 'FAILED' },
    });
    // La cita permanece en PENDING_PAYMENT — el paciente puede reintentar.
  }

  /**
   * Envía la confirmación de cita por WhatsApp tras el pago. No-bloqueante:
   * si no hay instancia WA conectada (dev/stub), WaMessageService lanza y lo
   * capturamos — la confirmación del pago ya se persistió igual.
   */
  private async sendConfirmation(appointmentId: string) {
    try {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          patient: { select: { phone: true, name: true } },
          doctor: { select: { name: true } },
          service: { select: { name: true } },
          tenant: { select: { slug: true, name: true, timezone: true } },
        },
      });
      if (!appt) return;

      const when = formatInTimeZone(
        appt.startTime,
        appt.tenant.timezone,
        "EEEE dd/MM 'a las' HH:mm",
      );
      const text =
        `✅ *Cita confirmada* — ${appt.tenant.name}\n\n` +
        `👨‍⚕️ ${appt.doctor.name}\n` +
        `🩺 ${appt.service.name}\n` +
        `📅 ${when}\n\n` +
        `¡Pago recibido! Te esperamos. Recibirás un recordatorio el día anterior.`;

      await this.waMessage.send({
        tenantId: appt.tenantId,
        tenantSlug: appt.tenant.slug,
        messageKey: `confirm:${appointmentId}`, // idempotente: 1 confirmación por cita
        phone: appt.patient.phone,
        text,
      });
    } catch (err) {
      this.logger.warn(
        { event: 'payment.confirmation.send-failed', appointmentId, err: (err as Error).message },
        'PaymentsWebhookService',
      );
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    return (err as { code?: string }).code === 'P2002';
  }
}
