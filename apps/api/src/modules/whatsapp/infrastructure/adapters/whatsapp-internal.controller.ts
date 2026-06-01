import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Public } from '../../../../common/decorators';
import { PrismaService } from '../../../../common/database/prisma.service';
import { WaBotService } from '../../application/services/wa-bot.service';

type WaEvent = 'connected' | 'disconnected' | 'qr' | 'message_received';

interface WaWebhookPayload {
  tenantId: string;
  event: WaEvent;
  phone?: string;
  text?: string;
  reason?: string;
}

@Public()
@Controller('internal/whatsapp')
export class WhatsappInternalController {
  private readonly secret = process.env.WA_INTERNAL_SECRET;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: WaBotService,
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

    const { tenantId, event, phone, text, reason } = payload;

    if (event === 'message_received') {
      if (!phone || !text) return { received: true };
      await this.handleIncomingMessage(tenantId, phone, text);
      return { received: true };
    }

    this.logger.log(
      { event: `wa.webhook.${event}`, tenantId, phone, reason },
      'WhatsappInternalController',
    );

    const statusMap: Record<Exclude<WaEvent, 'message_received'>, string> = {
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
          status: statusMap[event as Exclude<WaEvent, 'message_received'>] as never,
          phone: event === 'connected' ? phone : event === 'disconnected' ? null : undefined,
          lastSeen: new Date(),
        },
      });
    }

    return { received: true };
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
      select: { slug: true, timezone: true },
    });

    if (!tenant) return;

    // Derivar tenantSlug del containerName: "wa-clinica-demo" → "clinica-demo"
    const tenantSlug = instance.containerName.replace(/^wa-/, '');

    await this.bot.handleMessage({
      tenantId,
      instanceId: instance.id,
      tenantSlug: tenant.slug ?? tenantSlug,
      phone,
      text,
      timezone: tenant.timezone,
    });
  }
}
