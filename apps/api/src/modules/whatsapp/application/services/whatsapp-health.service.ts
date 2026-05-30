import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/database/prisma.service';
import { InstanceManagerService } from './instance-manager.service';

/**
 * Health checker periódico de instancias WhatsApp.
 *
 * Cada 30 segundos hace ping a todas las instancias activas (no STOPPED/ERROR).
 * Si una instancia no responde, la marca como DISCONNECTED y loguea el evento
 * para que el operador pueda actuar.
 *
 * El orquestador NO reinicia instancias automáticamente desde acá (el contenedor
 * tiene restart policy `unless-stopped` — Docker lo hace por sí solo). Esta clase
 * actualiza la vista en DB para que el admin panel muestre el estado real.
 */
@Injectable()
export class WhatsappHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manager: InstanceManagerService,
    private readonly logger: Logger,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkAllInstances() {
    const instances = await this.prisma.whatsappInstance.findMany({
      where: { status: { notIn: ['STOPPED', 'ERROR', 'CREATING'] } },
      select: { id: true, tenantId: true, status: true },
    });

    if (instances.length === 0) return;

    await Promise.allSettled(instances.map((inst) => this.checkAndUpdate(inst.id, inst.status)));
  }

  private async checkAndUpdate(instanceId: string, currentStatus: string) {
    const { alive, status, phone } = await this.manager.pingInstance(instanceId);

    if (!alive) {
      if (currentStatus !== 'DISCONNECTED') {
        await this.prisma.whatsappInstance.update({
          where: { id: instanceId },
          data: { status: 'DISCONNECTED', lastSeen: new Date() },
        });
        this.logger.warn(
          { event: 'wa.healthcheck.unreachable', instanceId },
          'WhatsappHealthService',
        );
      }
      return;
    }

    // Mapear estado del contenedor al enum de DB
    const statusMap: Record<string, string> = {
      connected: 'CONNECTED',
      pairing: 'PAIRING',
      disconnected: 'DISCONNECTED',
      error: 'ERROR',
    };
    const dbStatus = statusMap[status] ?? currentStatus;

    await this.prisma.whatsappInstance.update({
      where: { id: instanceId },
      data: {
        status: dbStatus as never,
        phone: phone ?? undefined,
        lastSeen: new Date(),
      },
    });
  }
}
