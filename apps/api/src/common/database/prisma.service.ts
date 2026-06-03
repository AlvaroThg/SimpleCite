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
   * Ejecuta `fn` dentro de una transacción donde se fijan:
   *   - `app.current_tenant_id` → aislamiento tenant (RLS)
   *   - `app.current_user_id` / `app.current_user_role` → control de acceso por
   *     rol en las políticas EHR (medical_notes). Se setean cuando hay un
   *     usuario autenticado; en flujos públicos (paciente) quedan vacíos.
   *
   * Todas las queries vía `prisma.client.*` heredan este contexto. Hoy las
   * políticas RLS están dormidas (el rol postgres bypasea RLS), pero el
   * contexto queda correctamente poblado para cuando se active el enforcement.
   */
  async runWithTenantContext<T>(
    tenantId: string,
    fn: () => Promise<T>,
    userCtx?: { userId?: string; role?: string },
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      // set_config(..., true) → LOCAL: solo aplica a esta transacción
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      if (userCtx?.userId) {
        await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userCtx.userId}, true)`;
      }
      if (userCtx?.role) {
        await tx.$executeRaw`SELECT set_config('app.current_user_role', ${userCtx.role}, true)`;
      }
      return tenantContextStorage.run({ tenantId, tx }, fn);
    });
  }
}
