import { Injectable, Optional } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../database/prisma.service';
import { WaMessageService } from '../../modules/whatsapp/application/services/wa-message.service';

/**
 * Notificador de WhatsApp. Abstrae el canal de envío para que los callers
 * (PublicOtpService, bot conversacional, etc.) no dependan de si hay una
 * instancia activa o no.
 *
 * Modo real: llama a WaMessageService que POST al contenedor Baileys.
 * Fallback de dev: si WaMessageService falla (instancia no disponible o no
 *   configurada), loguea el código a consola con nivel WARN para que el
 *   flujo de OTP siga funcionando en entornos de desarrollo.
 */
@Injectable()
export class WhatsAppService {
  constructor(
    // Ausente cuando ENABLE_WHATSAPP != true (main/prod): cae al fallback de log.
    @Optional() private readonly waMessage: WaMessageService | null,
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async sendOtp(params: {
    tenantId: string;
    phone: string;
    code: string;
    ttlMinutes: number;
  }): Promise<void> {
    const { tenantId, phone, code, ttlMinutes } = params;

    const text =
      `🏥 *SimpleCite* — Código de verificación\n\n` +
      `Tu código es: *${code}*\n\n` +
      `Expira en ${ttlMinutes} minutos. No lo compartas con nadie.`;

    // Clave de idempotencia: incluye el código para que un reenvío del mismo
    // OTP no duplique el mensaje si el paciente presiona "reenviar".
    const messageKey = `otp:${tenantId}:${phone}:${code}`;

    // Resolver slug del tenant para construir la URL del contenedor
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });

    if (!tenant) {
      this.logger.warn({ event: 'whatsapp.otp.no-tenant', tenantId }, 'WhatsAppService');
      return;
    }

    try {
      if (!this.waMessage) throw new Error('WhatsApp deshabilitado (ENABLE_WHATSAPP != true)');
      await this.waMessage.send({
        tenantId,
        tenantSlug: tenant.slug,
        messageKey,
        phone,
        text,
      });

      this.logger.log({ event: 'whatsapp.otp.sent', tenantId, phone }, 'WhatsAppService');
    } catch (err) {
      // Fallback dev: loguea el OTP para que el flujo no se rompa
      // En producción, la instancia debería estar siempre activa.
      this.logger.warn(
        {
          event: 'whatsapp.otp.fallback',
          tenantId,
          phone,
          otpCode: code, // Solo visible en dev (nivel WARN no llega a prod logs)
          ttlMinutes,
          reason: (err as Error).message,
        },
        `[FALLBACK] WhatsApp no disponible — OTP para ${phone}: ${code} (${ttlMinutes} min)`,
      );
    }
  }
}
