import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Public } from '../../../../common/decorators';
import { PrismaService } from '../../../../common/database/prisma.service';
import { StorageService } from '../../../../common/services/storage.service';
import { WaBotService } from '../../application/services/wa-bot.service';
import { WaMessageService } from '../../application/services/wa-message.service';

type WaEvent = 'connected' | 'disconnected' | 'qr' | 'message_received' | 'image_received';

interface WaWebhookPayload {
  tenantId: string;
  event: WaEvent;
  phone?: string;
  text?: string;
  imageBase64?: string;
  mimeType?: string;
  reason?: string;
}

@Public()
@Controller('internal/whatsapp')
export class WhatsappInternalController {
  private readonly secret = process.env.WA_INTERNAL_SECRET;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly bot: WaBotService,
    private readonly waMessage: WaMessageService,
    private readonly logger: Logger,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() payload: WaWebhookPayload,
  ) {
    if (this.secret && secret !== this.secret) {
      throw new UnauthorizedException('Invalid internal secret');
    }

    const { tenantId, event, phone, text, imageBase64, mimeType, reason } = payload;

    if (event === 'message_received') {
      if (!phone || !text) return { received: true };
      await this.handleIncomingMessage(tenantId, phone, text);
      return { received: true };
    }

    if (event === 'image_received') {
      if (!phone || !imageBase64 || !mimeType) return { received: true };
      await this.handleReceiptImage(tenantId, phone, imageBase64, mimeType);
      return { received: true };
    }

    this.logger.log(
      { event: `wa.webhook.${event}`, tenantId, phone, reason },
      'WhatsappInternalController',
    );

    const statusMap: Record<Exclude<WaEvent, 'message_received' | 'image_received'>, string> = {
      connected: 'CONNECTED',
      disconnected: 'DISCONNECTED',
      qr: 'PAIRING',
    };

    const instance = await this.prisma.whatsappInstance.findFirst({
      where: { tenantId, status: { notIn: ['STOPPED', 'ERROR'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (instance) {
      await this.prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: {
          status: statusMap[
            event as Exclude<WaEvent, 'message_received' | 'image_received'>
          ] as never,
          phone: event === 'connected' ? phone : event === 'disconnected' ? null : undefined,
          lastSeen: new Date(),
        },
      });
    }

    return { received: true };
  }

  private async handleReceiptImage(
    tenantId: string,
    phone: string,
    imageBase64: string,
    mimeType: string,
  ) {
    // Bot bloqueado si la suscripción de la clínica no está vigente.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true, subscriptionStatus: true, subscriptionEndDate: true },
    });
    if (!tenant || this.subscriptionInactive(tenant)) return;

    // Find patient's open PENDING_PAYMENT + STATIC_QR appointment
    const patient = await this.prisma.patient.findUnique({
      where: { phone_tenantId: { phone, tenantId } },
      select: { id: true },
    });
    if (!patient) return;

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        patientId: patient.id,
        status: 'PENDING_PAYMENT',
        paymentMethod: 'STATIC_QR',
        receiptUrl: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!appointment) return;

    // Subir el comprobante a la carpeta de la clínica en R2.
    const receiptUrl = await this.storage.uploadImageFromBase64(
      `${tenant.slug}/receipts`,
      imageBase64,
      mimeType,
    );

    await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { receiptUrl },
    });

    this.logger.log(
      { event: 'wa.receipt.uploaded', tenantId, phone, appointmentId: appointment.id },
      'WhatsappInternalController',
    );

    // Reply to patient
    const instance = await this.prisma.whatsappInstance.findFirst({
      where: { tenantId, status: 'CONNECTED' },
      select: { id: true, containerName: true },
    });
    if (!instance) return;

    const tenantSlug = instance.containerName.replace(/^wa-/, '');
    await this.waMessage.send({
      tenantId,
      tenantSlug,
      phone,
      messageKey: `receipt:${appointment.id}`,
      text: '✅ *Comprobante recibido.*\n\nUn administrativo revisará tu pago y confirmará tu cita en breve. ¡Gracias!',
    });
  }

  private async handleIncomingMessage(tenantId: string, phone: string, text: string) {
    const instance = await this.prisma.whatsappInstance.findFirst({
      where: { tenantId, status: 'CONNECTED' },
      select: { id: true, containerName: true },
    });

    if (!instance) {
      this.logger.warn(
        { event: 'wa.bot.no-instance', tenantId, phone },
        'WhatsappInternalController',
      );
      return;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        slug: true,
        timezone: true,
        subscriptionStatus: true,
        subscriptionEndDate: true,
      },
    });

    if (!tenant) return;

    // Derivar tenantSlug del containerName: "wa-clinica-demo" → "clinica-demo"
    const tenantSlug = instance.containerName.replace(/^wa-/, '');

    // Bot totalmente bloqueado si la clínica no tiene suscripción vigente.
    // Avisamos a lo sumo una vez al día por paciente (messageKey con fecha).
    if (this.subscriptionInactive(tenant)) {
      this.logger.warn(
        { event: 'wa.bot.subscription-inactive', tenantId },
        'WhatsappInternalController',
      );
      await this.waMessage
        .send({
          tenantId,
          tenantSlug: tenant.slug ?? tenantSlug,
          phone,
          messageKey: `sub-inactive:${tenantId}:${phone}:${new Date().toISOString().slice(0, 10)}`,
          text: '⚠️ El servicio de reservas por WhatsApp no está disponible en este momento. Por favor, contacta directamente a la clínica.',
        })
        .catch(() => undefined);
      return;
    }

    await this.bot.handleMessage({
      tenantId,
      instanceId: instance.id,
      tenantSlug: tenant.slug ?? tenantSlug,
      phone,
      text,
      timezone: tenant.timezone,
    });
  }

  /** ¿La suscripción del tenant está vencida/inactiva? (bloquea el bot) */
  private subscriptionInactive(t: {
    subscriptionStatus: string;
    subscriptionEndDate: Date | null;
  }): boolean {
    if (t.subscriptionStatus === 'PAST_DUE' || t.subscriptionStatus === 'CANCELED') return true;
    if (t.subscriptionEndDate && t.subscriptionEndDate.getTime() < Date.now()) return true;
    return false;
  }
}
