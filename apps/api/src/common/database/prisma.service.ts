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

  /**
   * Cuando false (default), RLS está dormante: NO se abre transacción por
   * request (el aislamiento lo da el filtro `where:{tenantId}` app-layer). Esto
   * elimina ~5 round-trips por request a Supabase. Cuando true, se activa el
   * enforcement real con transacción + set_config (ver docs/rls-enforcement.md).
   */
  private readonly rlsEnforced = process.env.RLS_ENFORCED === 'true';

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
    // ── Modo dormante (default): sin transacción ni set_config ──
    // El aislamiento ya lo garantiza el `where:{tenantId}` de cada servicio;
    // abrir una transacción solo añadiría round-trips de latencia. `prisma.client`
    // cae al cliente base (no hay `tx` en el store).
    if (!this.rlsEnforced) {
      return fn();
    }

    // ── Modo enforcement: transacción + contexto en UN solo round-trip ──
    return this.$transaction(async (tx) => {
      // set_config(..., true) → LOCAL a la transacción. Los tres en un statement
      // para no pagar 3 viajes a la DB.
      await tx.$executeRaw`SELECT
        set_config('app.current_tenant_id', ${tenantId}, true),
        set_config('app.current_user_id', ${userCtx?.userId ?? ''}, true),
        set_config('app.current_user_role', ${userCtx?.role ?? ''}, true)`;
      return tenantContextStorage.run({ tenantId, tx }, fn);
    });
  }
}
