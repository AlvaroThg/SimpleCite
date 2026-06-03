/**
 * Utilidades de paginación cursor-based.
 *
 * El cursor es el `id` del último elemento de la página anterior. Prisma
 * pagina con `cursor` + `skip: 1` para saltar el ancla. Se pide `limit + 1`
 * para saber si hay siguiente página sin un COUNT extra.
 */

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Normaliza el limit pedido a [1, MAX_LIMIT]. */
export function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

/**
 * Construye los argumentos de cursor para Prisma findMany.
 * Úsalo con `take: limit + 1` y luego pásale el resultado a `buildPage`.
 * El tipo de retorno explícito evita que el spread genere una unión que
 * confunda los tipos de input estrictos de Prisma.
 */
export function cursorArgs(cursor?: string): { cursor?: { id: string }; skip?: number } {
  if (!cursor) return {};
  return { cursor: { id: cursor }, skip: 1 };
}

/**
 * Recorta el resultado (que pidió limit+1) a `limit` y calcula el nextCursor.
 */
export function buildPage<T extends { id: string }>(rows: T[], limit: number): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  return { items, nextCursor, hasMore };
}
