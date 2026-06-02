import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/database/prisma.service';
import { QrSimpleClient } from './qr-simple.client';

const PAYMENT_TTL_MINUTES = 15;

/**
 * Lógica de negocio de pagos: emisión de intents, reintentos con historial,
 * y consulta de estado. La confirmación llega por webhook (PaymentsWebhookController).
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrClient: QrSimpleClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Crea un PaymentIntent para una cita y genera el QR.
   *
   * Reintentos: si ya existe un intent PENDING para esta cita, se marca como
   * EXPIRED y se crea uno nuevo — preservando el historial completo.
   *
   * Bloqueo de precio: el monto se congela en el intent (snapshot). Aunque el
   * precio del servicio cambie luego, este intent mantiene su monto.
   */
  async createIntent(params: {
    tenantId: string;
    appointmentId: string;
    /// Si se provee, valida que la cita pertenezca a este teléfono (flujo paciente).
    expectedPhone?: string;
  }) {
    const { tenantId, appointmentId, expectedPhone } = params;

    const appointment = await this.prisma.client.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        patient: { select: { phone: true } },
        service: { select: { price: true } },
        doctor: { select: { id: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada');

    if (expectedPhone && appointment.patient.phone !== expectedPhone) {
      throw new ForbiddenException('Esta cita no te pertenece');
    }

    // Solo se puede pagar una cita TENTATIVE o PENDING_PAYMENT
    if (!['TENTATIVE', 'PENDING_PAYMENT'].includes(appointment.status)) {
      throw new BadRequestException(`La cita está en estado ${appointment.status}, no admite pago`);
    }

    // Resolver el monto: customPrice del doctorService o price del servicio
    const link = await this.prisma.client.doctorService.findFirst({
      where: { doctorId: appointment.doctorId, serviceId: appointment.serviceId, tenantId },
      select: { customPrice: true },
    });
    const amount = Number(link?.customPrice ?? appointment.service.price);

    // Expirar intents PENDING previos (preservar historial)
    await this.prisma.client.paymentIntent.updateMany({
      where: { appointmentId, tenantId, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });

    // Crear el cobro en el proveedor
    const charge = await this.qrClient.createCharge({
      amount,
      currency: 'BOB',
      reference: appointmentId,
      description: `Cita SimpleCite ${appointmentId.slice(0, 8)}`,
      expiresInMinutes: PAYMENT_TTL_MINUTES,
    });

    // Persistir el intent
    const intent = await this.prisma.client.paymentIntent.create({
      data: {
        tenantId,
        appointmentId,
        amount,
        currency: 'BOB',
        status: 'PENDING',
        providerPaymentId: charge.providerPaymentId,
        qrPayload: charge.qrPayload,
        expiresAt: charge.expiresAt,
      },
    });

    // Actualizar la cita: guardar el QR y pasar a PENDING_PAYMENT
    await this.prisma.client.appointment.update({
      where: { id: appointmentId },
      data: {
        qrPayload: charge.qrPayload,
        status: 'PENDING_PAYMENT',
        // Limpiar expiresAt de TENTATIVE: ahora el TTL lo gobierna el intent
        expiresAt: null,
      },
    });

    this.logger.log(
      {
        event: 'payment.intent.created',
        tenantId,
        appointmentId,
        intentId: intent.id,
        amount,
        providerPaymentId: charge.providerPaymentId,
      },
      'PaymentsService',
    );

    return {
      intentId: intent.id,
      amount,
      currency: intent.currency,
      qrPayload: intent.qrPayload,
      expiresAt: intent.expiresAt,
      status: intent.status,
    };
  }

  /**
   * Estado de un intent (para polling desde el cliente).
   */
  async getIntentStatus(params: { tenantId: string; intentId: string; expectedPhone?: string }) {
    const { tenantId, intentId, expectedPhone } = params;

    const intent = await this.prisma.client.paymentIntent.findFirst({
      where: { id: intentId, tenantId },
      include: { appointment: { select: { status: true, patient: { select: { phone: true } } } } },
    });
    if (!intent) throw new NotFoundException('Intent de pago no encontrado');

    if (expectedPhone && intent.appointment.patient.phone !== expectedPhone) {
      throw new ForbiddenException('Este pago no te pertenece');
    }

    return {
      intentId: intent.id,
      status: intent.status,
      appointmentStatus: intent.appointment.status,
      amount: Number(intent.amount),
      currency: intent.currency,
      expiresAt: intent.expiresAt,
      paidAt: intent.paidAt,
    };
  }
}
