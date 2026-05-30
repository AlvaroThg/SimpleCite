import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

/**
 * Stub del notificador de WhatsApp.
 *
 * En Fase 4 (esta) loguea el OTP a consola para que el dev pueda copiarlo
 * y probar el flujo. La integración real (whatsapp-web.js orquestado por
 * Docker por tenant) llega en Fase 5.
 *
 * Mantener la firma estable: el módulo OTP no debería cambiar al hacer el swap.
 */
@Injectable()
export class WhatsAppService {
  constructor(private readonly logger: Logger) {}

  /**
   * Envía un mensaje con el código OTP al paciente vía WhatsApp.
   *
   * STUB: imprime el código a consola con nivel WARN — visible en todos
   * los entornos para facilitar la prueba manual del flujo.
   */
  async sendOtp(params: {
    tenantId: string;
    phone: string;
    code: string;
    ttlMinutes: number;
  }): Promise<void> {
    const { tenantId, phone, code, ttlMinutes } = params;

    // STUB intencionalmente ruidoso — en prod este código nunca llegará al log.
    this.logger.warn(
      {
        event: 'whatsapp.otp.stub',
        tenantId,
        phone,
        otpCode: code,
        ttlMinutes,
      },
      `[STUB] WhatsApp OTP para ${phone}: ${code} (expira en ${ttlMinutes} min)`,
    );
  }
}
