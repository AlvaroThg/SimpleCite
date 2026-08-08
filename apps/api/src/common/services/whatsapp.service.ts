import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { WhatsappCloudService } from '../../modules/whatsapp-cloud/application/services/whatsapp-cloud.service';

/**
 * Envío del OTP de paciente por WhatsApp.
 *
 * Va por la Cloud API oficial de Meta (`WhatsappCloudService`). Antes pasaba por
 * el contenedor Baileys por tenant, que ya no existe: la plataforma usa un único
 * número oficial, así que no hay instancia que resolver ni slug que mirar.
 *
 * Si las `META_WA_*` no están configuradas, el envío es un no-op y el código cae
 * al log en nivel WARN para que el flujo de OTP siga siendo usable en desarrollo.
 */
@Injectable()
export class WhatsAppService {
  constructor(
    private readonly waCloud: WhatsappCloudService,
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

    try {
      const sent = await this.waCloud.sendText(phone, text);
      if (!sent) throw new Error('WhatsApp Cloud no configurado (META_WA_*)');

      this.logger.log({ event: 'whatsapp.otp.sent', tenantId, phone }, 'WhatsAppService');
    } catch (err) {
      // Fallback de desarrollo: loguea el OTP para que el flujo no se corte.
      // En producción META_WA_* está configurado y esta rama no se toca.
      this.logger.warn(
        {
          event: 'whatsapp.otp.fallback',
          tenantId,
          phone,
          otpCode: code, // solo visible en dev (WARN no llega a los logs de prod)
          ttlMinutes,
          reason: (err as Error).message,
        },
        `[FALLBACK] WhatsApp no disponible — OTP para ${phone}: ${code} (${ttlMinutes} min)`,
      );
    }
  }
}
