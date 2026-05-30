import {
  Injectable,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import Docker from 'dockerode';
import { PrismaService } from '../../../../common/database/prisma.service';

const WA_INSTANCE_IMAGE = 'simplecite-wa-instance:latest';
const WA_INTERNAL_PORT = 4000;

/**
 * Orquestador de contenedores WhatsApp (un contenedor Baileys por tenant).
 *
 * Todos los cambios de estado (CREATING → STARTING, etc.) se reflejan
 * en `whatsapp_instances`. El contenedor se comunica con el API via webhook
 * cuando cambia su estado de conexión.
 *
 * Nota de seguridad:
 *   Requiere que `/var/run/docker.sock` esté montado en el contenedor del API.
 *   En docker-compose.yml: `volumes: - /var/run/docker.sock:/var/run/docker.sock:ro`
 *   Conceder acceso de solo lectura al socket no es posible (Docker no lo soporta),
 *   pero en prod el API container no debería estar expuesto directamente a internet.
 */
@Injectable()
export class InstanceManagerService implements OnModuleInit {
  private docker!: Docker;
  private readonly dockerNetwork: string;
  private readonly waCallbackUrl: string;
  private readonly internalSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {
    this.dockerNetwork = config.get<string>('WA_DOCKER_NETWORK') ?? 'simplecite-internal';
    this.waCallbackUrl =
      config.get<string>('WA_CALLBACK_URL') ??
      'http://simplecite-api:3001/api/internal/whatsapp/webhook';
    this.internalSecret = config.get<string>('WA_INTERNAL_SECRET') ?? '';
  }

  onModuleInit() {
    try {
      const socketPath =
        process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
      this.docker = new Docker({ socketPath });
    } catch (err) {
      this.logger.warn(
        { event: 'docker.init.failed', err: (err as Error).message },
        'InstanceManagerService: Docker socket not available — WA orchestration disabled',
      );
    }
  }

  private containerName(slug: string) {
    return `wa-${slug}`;
  }

  private instanceUrl(slug: string) {
    return `http://${this.containerName(slug)}:${WA_INTERNAL_PORT}`;
  }

  // ─── Public API ───────────────────────────────────────────────────

  async createInstance(tenantId: string, tenantSlug: string) {
    if (!this.docker) throw new ServiceUnavailableException('Docker no disponible');

    // Verificar que no exista ya una instancia para este tenant
    const existing = await this.prisma.whatsappInstance.findFirst({
      where: { tenantId, status: { notIn: ['STOPPED', 'ERROR'] } },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe una instancia activa para este tenant (${existing.status})`,
      );
    }

    const containerName = this.containerName(tenantSlug);

    // 1. Crear registro en DB (estado CREATING)
    const instance = await this.prisma.whatsappInstance.create({
      data: {
        tenantId,
        containerName,
        status: 'CREATING',
      },
    });

    // 2. Crear y arrancar el contenedor (fuera de la tx de tenant)
    try {
      await this.ensureNetworkExists();

      // Eliminar contenedor anterior si quedó huérfano
      await this.removeContainerIfExists(containerName);

      const container = await this.docker.createContainer({
        name: containerName,
        Image: WA_INSTANCE_IMAGE,
        Env: [
          `TENANT_ID=${tenantId}`,
          `PORT=${WA_INTERNAL_PORT}`,
          `SESSION_DIR=/session`,
          `WEBHOOK_URL=${this.waCallbackUrl}`,
          `INTERNAL_SECRET=${this.internalSecret}`,
          `LOG_LEVEL=${this.config.get('NODE_ENV') === 'production' ? 'info' : 'debug'}`,
        ],
        HostConfig: {
          // Red interna — sin exposición de puertos al host
          NetworkMode: this.dockerNetwork,
          Binds: [`wa-session-${tenantSlug}:/session`],
          // Límites de recursos: 256MB RAM, 25% de un CPU
          Memory: 256 * 1024 * 1024,
          MemorySwap: 256 * 1024 * 1024, // sin swap
          CpuQuota: 25000, // 25% del período CFS (100000 µs default)
          CpuPeriod: 100000,
          RestartPolicy: { Name: 'unless-stopped' },
        },
      });

      await container.start();

      await this.prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { containerId: container.id.slice(0, 12), status: 'STARTING' },
      });

      this.logger.log(
        {
          event: 'wa.instance.created',
          tenantId,
          containerName,
          containerId: container.id.slice(0, 12),
        },
        'InstanceManagerService',
      );

      return this.prisma.whatsappInstance.findUnique({ where: { id: instance.id } });
    } catch (err) {
      await this.prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { status: 'ERROR' },
      });
      this.logger.error(
        { event: 'wa.instance.create.failed', tenantId, err: (err as Error).message },
        'InstanceManagerService',
      );
      throw err;
    }
  }

  async stopInstance(tenantId: string, instanceId: string) {
    const instance = await this.prisma.whatsappInstance.findFirst({
      where: { id: instanceId, tenantId },
    });
    if (!instance) throw new NotFoundException('Instancia no encontrada');

    if (instance.containerId) {
      try {
        const container = this.docker.getContainer(instance.containerId);
        await container.stop({ t: 10 });
      } catch (err: any) {
        // Si el contenedor no existe, ignoramos
        if (err?.statusCode !== 404) {
          this.logger.warn({ event: 'wa.stop.error', err: err.message }, 'InstanceManagerService');
        }
      }
    }

    return this.prisma.whatsappInstance.update({
      where: { id: instanceId },
      data: { status: 'STOPPED' },
    });
  }

  async destroyInstance(tenantId: string, instanceId: string) {
    const instance = await this.prisma.whatsappInstance.findFirst({
      where: { id: instanceId, tenantId },
    });
    if (!instance) throw new NotFoundException('Instancia no encontrada');

    if (instance.containerId) {
      try {
        const container = this.docker.getContainer(instance.containerId);
        await container.stop({ t: 5 }).catch(() => {});
        await container.remove({ force: true });
      } catch (err: any) {
        if (err?.statusCode !== 404) {
          this.logger.warn(
            { event: 'wa.destroy.error', err: err.message },
            'InstanceManagerService',
          );
        }
      }
    }

    return this.prisma.whatsappInstance.update({
      where: { id: instanceId },
      data: { status: 'STOPPED', containerId: null },
    });
  }

  async restartInstance(tenantId: string, instanceId: string) {
    const instance = await this.prisma.whatsappInstance.findFirst({
      where: { id: instanceId, tenantId },
    });
    if (!instance) throw new NotFoundException('Instancia no encontrada');
    if (!instance.containerId) throw new ConflictException('El contenedor no existe');

    const container = this.docker.getContainer(instance.containerId);
    await container.restart({ t: 10 });

    return this.prisma.whatsappInstance.update({
      where: { id: instanceId },
      data: { status: 'STARTING', restartCount: { increment: 1 } },
    });
  }

  async listInstances(tenantId: string) {
    return this.prisma.whatsappInstance.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInstanceByTenantId(tenantId: string) {
    return this.prisma.whatsappInstance.findFirst({
      where: { tenantId, status: { in: ['STARTING', 'PAIRING', 'CONNECTED', 'DISCONNECTED'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * URL del servicio HTTP del contenedor Baileys para llamadas internas.
   * Solo disponible dentro de la red Docker `simplecite-internal`.
   */
  getInstanceServiceUrl(slug: string) {
    return this.instanceUrl(slug);
  }

  // ─── Observabilidad: ping individual ─────────────────────────────

  async pingInstance(
    instanceId: string,
  ): Promise<{ alive: boolean; status: string; phone: string | null }> {
    const instance = await this.prisma.whatsappInstance.findUnique({ where: { id: instanceId } });
    if (!instance) return { alive: false, status: 'not_found', phone: null };

    const url = `http://${instance.containerName}:${WA_INTERNAL_PORT}/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const body = (await res.json()) as { status: string; phone?: string | null };
      return { alive: true, status: body.status, phone: body.phone ?? null };
    } catch {
      return { alive: false, status: instance.status, phone: instance.phone };
    }
  }

  // ─── Helpers privados ─────────────────────────────────────────────

  private async ensureNetworkExists() {
    try {
      const networks = await this.docker.listNetworks({ filters: { name: [this.dockerNetwork] } });
      if (networks.length === 0) {
        await this.docker.createNetwork({
          Name: this.dockerNetwork,
          Driver: 'bridge',
          CheckDuplicate: true,
        });
        this.logger.log(
          { event: 'docker.network.created', name: this.dockerNetwork },
          'InstanceManagerService',
        );
      }
    } catch (err) {
      this.logger.warn(
        { event: 'docker.network.error', err: (err as Error).message },
        'InstanceManagerService',
      );
    }
  }

  private async removeContainerIfExists(name: string) {
    try {
      const container = this.docker.getContainer(name);
      const info = await container.inspect();
      if (info) {
        await container.stop({ t: 5 }).catch(() => {});
        await container.remove({ force: true });
        this.logger.log({ event: 'wa.orphan.removed', name }, 'InstanceManagerService');
      }
    } catch {
      // No existe — OK
    }
  }
}
