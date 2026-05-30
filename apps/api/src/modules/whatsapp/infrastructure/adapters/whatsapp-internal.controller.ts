import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Public } from '../../../../common/decorators';
import { PrismaService } from '../../../../common/database/prisma.service';

interface WaWebhookPayload {
  tenantId: string;
  event: 'connected' | 'disconnected' | 'qr';
  phone?: string;
  reason?: string;
}

/**
 * Webhook receiver para eventos de los contenedores Baileys.
 *
 * Los contenedores POST a este endpoint cuando cambia su estado de conexión.
 * Solo es accesible desde dentro de la red Docker `simplecite-internal`
 * (no expuesto al internet directamente). Autenticado por `x-internal-secret`.
 *
 * Este controller actualiza la tabla `whatsapp_instances` en la DB para
 * mantener sincronizado el estado real del contenedor con la vista en DB.
 *
 * @Public() es necesario para bypassear el JwtAuthGuard global.
 * La autenticación es por `x-internal-secret` (shared secret entre API y contenedores).
 */
@Public()
@Controller('internal/whatsapp')
export class WhatsappInternalController {
  private readonly secret = process.env.WA_INTERNAL_SECRET;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() payload: WaWebhookPayload,
  ) {
    // Validar shared secret (solo si está configurado — dev puede dejarlo vacío)
    if (this.secret && secret !== this.secret) {
      throw new UnauthorizedException('Invalid internal secret');
    }

    const { tenantId, event, phone, reason } = payload;

    this.logger.log(
      { event: `wa.webhook.${event}`, tenantId, phone, reason },
      'WhatsappInternalController',
    );

    const statusMap: Record<WaWebhookPayload['event'], string> = {
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
          status: statusMap[event] as never,
          phone: event === 'connected' ? phone : event === 'disconnected' ? null : undefined,
          lastSeen: new Date(),
        },
      });
    }

    return { received: true };
  }
}
