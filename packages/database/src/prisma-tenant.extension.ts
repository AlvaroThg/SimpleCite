import { PrismaClient } from '@prisma/client';

/**
 * Crea un PrismaClient extendido que inyecta automáticamente el tenant_id
 * como variable de sesión de PostgreSQL antes de cada query.
 *
 * Esto permite que las políticas RLS de Supabase filtren los datos
 * automáticamente sin necesidad de agregar WHERE tenant_id = ... manualmente.
 *
 * Uso:
 *   const prisma = createTenantPrismaClient('tenant-uuid-here');
 *   const users = await prisma.user.findMany(); // Solo retorna users del tenant
 */
export function createTenantPrismaClient(tenantId: string) {
  const basePrisma = new PrismaClient();

  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          // Establecer el tenant_id en la sesión de PostgreSQL
          // El flag TRUE hace que sea LOCAL a la transacción actual
          const [, result] = await basePrisma.$transaction([
            basePrisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
            query(args),
          ]);

          return result;
        },
      },
    },
  });
}

/**
 * Singleton de PrismaClient para uso sin RLS (ej: seeds, migraciones, admin global).
 * ⚠️ NO usar en código de producción que maneja datos de tenants.
 */
let globalPrisma: PrismaClient | undefined;

export function getGlobalPrismaClient(): PrismaClient {
  if (!globalPrisma) {
    globalPrisma = new PrismaClient();
  }
  return globalPrisma;
}
