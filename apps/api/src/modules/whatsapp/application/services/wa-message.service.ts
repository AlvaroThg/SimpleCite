import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/database/prisma.service';
import { InstanceManagerService } from './instance-manager.service';

const MAX_ATTEMPTS = 3;

/**
 * Envío de mensajes WhatsApp con idempotencia y reintento.
 *
 * Flujo:
 *  1. Buscar (o crear) un registro en `whatsapp_messages` por `messageKey`.
 *  2. Si ya está SENT → devolver sin reenviar.
 *  3. Localizar la instancia CONNECTED del tenant.
 *  4. POST a `http://wa-{slug}:4000/send`.
 *  5. Actualizar estado (SENT / FAILED) en DB.
 *
 * El caller (PublicOtpService, bot conversacional, etc.) genera el messageKey
 * y puede reintentar con el mismo key sin riesgo de duplicar el mensaje.
 */
@Injectable()
export class WaMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manager: InstanceManagerService,
    private readonly logger: Logger,
  ) {}

  /**
   * @param tenantId   — tenant scope (RLS + lookup de instancia)
   * @param tenantSlug — slug para construir la URL del contenedor
   * @param messageKey — clave de idempotencia; el mismo key = no reenvío
   * @param phone      — E.164 sin '+' (ej: 59170000000)
   * @param text       — texto del mensaje
   */
  async send(params: {
    tenantId: string;
    tenantSlug: string;
    messageKey: string;
    phone: string;
    text: string;
  }): Promise<{ sent: boolean; messageKey: string }> {
    const { tenantId, tenantSlug, messageKey, phone, text } = params;

    // Buscar instancia conectada
    const instance = await this.manager.getInstanceByTenantId(tenantId);
    if (!instance || instance.status !== 'CONNECTED') {
      throw new ServiceUnavailableException(
        instance
          ? `Instancia WhatsApp en estado ${instance.status}, no puede enviar mensajes`
          : 'No hay instancia WhatsApp activa para este tenant',
      );
    }

    // Idempotencia: buscar registro existente
    const existing = await this.prisma.whatsappMessage.findUnique({ where: { messageKey } });
    if (existing?.status === 'SENT') {
      this.logger.log({ event: 'wa.message.duplicate', messageKey }, 'WaMessageService');
      return { sent: true, messageKey };
    }

    // Crear o reutilizar registro
    let msgRecord = existing;
    if (!msgRecord) {
      msgRecord = await this.prisma.whatsappMessage.create({
        data: { tenantId, instanceId: instance.id, messageKey, phone, text },
      });
    }

    // Intentar envío con retry
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const url = `${this.manager.getInstanceServiceUrl(tenantSlug)}/send`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.WA_INTERNAL_SECRET ?? '',
          },
          body: JSON.stringify({ phone, text, messageKey }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        // Éxito
        await this.prisma.whatsappMessage.update({
          where: { id: msgRecord.id },
          data: { status: 'SENT', attempts: attempt, sentAt: new Date(), error: null },
        });

        this.logger.log(
          { event: 'wa.message.sent', messageKey, phone, attempt },
          'WaMessageService',
        );
        return { sent: true, messageKey };
      } catch (err) {
        const errMsg = (err as Error).message;
        this.logger.warn(
          { event: 'wa.message.attempt.failed', messageKey, attempt, err: errMsg },
          'WaMessageService',
        );

        if (attempt === MAX_ATTEMPTS) {
          await this.prisma.whatsappMessage.update({
            where: { id: msgRecord.id },
            data: { status: 'FAILED', attempts: attempt, error: errMsg },
          });
          throw err;
        }

        // Back-off lineal: 1s, 2s
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }

    return { sent: false, messageKey };
  }
}
