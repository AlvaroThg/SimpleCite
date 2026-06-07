import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Sse,
  MessageEvent,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { CurrentUser, Roles } from '../../../../common/decorators';
import { SubscriptionGuard } from '../../../billing/infrastructure/guards/subscription.guard';
import { InstanceManagerService } from '../../application/services/instance-manager.service';
import { PrismaService } from '../../../../common/database/prisma.service';

/**
 * Endpoints de administración de instancias WhatsApp.
 * Solo accesibles por ADMIN del tenant.
 *
 * Rutas:
 *   POST   /admin/whatsapp/instances           → crear instancia para este tenant
 *   GET    /admin/whatsapp/instances           → listar instancias del tenant
 *   DELETE /admin/whatsapp/instances/:id       → detener y destruir
 *   POST   /admin/whatsapp/instances/:id/stop  → solo detener (sin destruir)
 *   POST   /admin/whatsapp/instances/:id/restart → reiniciar
 *   GET    /admin/whatsapp/instances/:id/qr    → SSE stream del QR de pairing
 */
// La gestión de WhatsApp requiere suscripción vigente (402 si vencida).
@Roles('ADMIN')
@UseGuards(SubscriptionGuard)
@Controller('admin/whatsapp/instances')
export class WhatsappAdminController {
  constructor(
    private readonly manager: InstanceManagerService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(@CurrentUser('tenantId') tenantId: string) {
    // Resolver el slug del tenant para construir el nombre del contenedor
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    const instance = await this.manager.createInstance(tenantId, tenant.slug);
    return { success: true, data: instance };
  }

  @Get()
  async list(@CurrentUser('tenantId') tenantId: string) {
    const instances = await this.manager.listInstances(tenantId);
    return { success: true, data: instances };
  }

  @Post(':id/stop')
  async stop(@CurrentUser('tenantId') tenantId: string, @Param('id') instanceId: string) {
    const instance = await this.manager.stopInstance(tenantId, instanceId);
    return { success: true, data: instance };
  }

  @Delete(':id')
  async destroy(@CurrentUser('tenantId') tenantId: string, @Param('id') instanceId: string) {
    const instance = await this.manager.destroyInstance(tenantId, instanceId);
    return { success: true, data: instance };
  }

  @Post(':id/restart')
  async restart(@CurrentUser('tenantId') tenantId: string, @Param('id') instanceId: string) {
    const instance = await this.manager.restartInstance(tenantId, instanceId);
    return { success: true, data: instance };
  }

  /**
   * SSE stream que proxea el /qr del contenedor Baileys hacia el cliente admin.
   *
   * El panel admin abre este endpoint y espera eventos:
   *   { type: "qr", qr: "data:image/png;base64,..." }   → mostrar QR
   *   { type: "connected", phone: "591..." }             → ocultar QR, mostrar teléfono
   *   { type: "pairing" }                                → esperando QR
   *   { type: "disconnected" }                           → error/desconexión
   *
   * El stream se cierra automáticamente cuando el cliente desconecta.
   */
  @Sse(':id/qr')
  qrStream(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') instanceId: string,
  ): Observable<MessageEvent> {
    // IMPORTANTE: @Sse() requiere un Observable SÍNCRONO (no Promise<Observable>).
    // El decorador no hace await; si devolvemos una Promise, el stream no fluye.
    // Por eso resolvemos la instancia DENTRO del stream con from()+switchMap().
    const instance$ = from(
      this.prisma.whatsappInstance.findFirst({
        where: { id: instanceId, tenantId },
        select: { containerName: true },
      }),
    );

    return instance$.pipe(
      switchMap((instance) => {
        if (!instance) throw new NotFoundException('Instancia no encontrada');
        return this.proxyQrStream(`http://${instance.containerName}:4000/qr`);
      }),
    );
  }

  /**
   * Crea un Observable que proxea el SSE del contenedor Baileys.
   * Lee el stream de /qr del contenedor y reenvía cada evento al cliente admin.
   */
  private proxyQrStream(url: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const abortController = new AbortController();
      let cleanup: (() => void) | null = null;

      fetch(url, {
        signal: abortController.signal,
        headers: {
          Accept: 'text/event-stream',
          'x-internal-secret': process.env.WA_INTERNAL_SECRET ?? '',
        },
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            subscriber.error(new Error(`WA instance returned ${res.status}`));
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          cleanup = () => {
            abortController.abort();
            reader.cancel().catch(() => {});
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done || subscriber.closed) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
                  subscriber.next({ data } as MessageEvent);
                  // Auto-cerrar el stream cuando la conexión WhatsApp es exitosa
                  if (data.type === 'connected') {
                    subscriber.complete();
                    return;
                  }
                } catch {
                  // línea malformada, ignorar
                }
              }
            }
          }

          subscriber.complete();
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') {
            subscriber.error(err);
          }
        });

      return () => {
        cleanup?.();
      };
    });
  }
}
