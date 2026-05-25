import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@simplecite/database';

export interface TenantContext {
  tenantId: string;
  tx: Prisma.TransactionClient;
}

/**
 * AsyncLocalStorage que propaga el tenant context (y su transacción Prisma)
 * a lo largo de la cadena async de una request.
 *
 * Poblado por TenantContextInterceptor antes de invocar al handler.
 * Consumido por PrismaService.client para enrutar queries al tx activo.
 */
export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();
