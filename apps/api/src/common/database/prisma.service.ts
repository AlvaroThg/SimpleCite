import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@simplecite/database';
import { tenantContextStorage } from './tenant-context.storage';

/**
 * Servicio singleton de Prisma con lifecycle hooks de NestJS.
 * Se conecta/desconecta automáticamente con el ciclo de vida del módulo.
 *
 * **Multi-tenancy:** Los services deben usar `prisma.client.*` (no `prisma.*`)
 * para que las queries se enruten al transaction client activo cuando hay
 * tenant context. Esto activa las políticas RLS de PostgreSQL.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Conectado a PostgreSQL (Supabase)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🔌 Desconectado de PostgreSQL');
  }

  /**
   * Cliente Prisma activo: la transacción tenant-scoped si hay contexto,
   * o el cliente base en su defecto. Los services tenant-scoped deben usar
   * `this.prisma.client.<model>` para que RLS aplique.
   */
  get client(): Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  > {
    const ctx = tenantContextStorage.getStore();
    return (ctx?.tx ?? this) as never;
  }

  /**
   * Ejecuta `fn` dentro de una transacción donde `app.current_tenant_id`
   * está fijado a `tenantId`. Todas las queries Prisma anidadas (vía
   * `prisma.client.*`) heredan ese contexto y son filtradas por RLS.
   */
  async runWithTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      // set_config(..., true) → LOCAL: solo aplica a esta transacción
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return tenantContextStorage.run({ tenantId, tx }, fn);
    });
  }
}
