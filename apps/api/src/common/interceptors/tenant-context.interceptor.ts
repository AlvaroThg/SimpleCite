import type { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { from, firstValueFrom } from 'rxjs';
import { PrismaService } from '../database/prisma.service';

/**
 * Interceptor que activa el tenant context para toda la request.
 *
 * Envuelve la ejecución del handler en una transacción Prisma con
 * `set_config('app.current_tenant_id', tenantId, true)`. Esto:
 *   1. Activa las políticas RLS de PostgreSQL para el tenant correcto.
 *   2. Garantiza que cualquier query lanzada vía `prisma.client.*`
 *      participe de la misma transacción (snapshot consistente).
 *
 * Requiere que TenantMiddleware haya poblado `request.tenantId` antes.
 * Si no hay tenantId (ej: health check, login público), no envuelve nada.
 *
 * EXCEPCIÓN — endpoints SSE (@Sse()): se saltan por completo. Un stream SSE
 * emite múltiples valores a lo largo del tiempo; `firstValueFrom` tomaría solo
 * el primero y cerraría, y la transacción expiraría (timeout 5s). Los handlers
 * SSE deben filtrar por tenantId explícitamente en sus queries.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.tenantId;

    if (!tenantId) {
      return next.handle();
    }

    // Endpoints SSE: el cliente envía `Accept: text/event-stream`. No los
    // envolvemos en la transacción — `firstValueFrom` tomaría solo el primer
    // evento del stream y la transacción expiraría (timeout 5s). Los handlers
    // SSE filtran por tenantId explícitamente en sus queries.
    const accept = (request.headers?.accept ?? '') as string;
    if (accept.includes('text/event-stream')) {
      return next.handle();
    }

    return from(this.prisma.runWithTenantContext(tenantId, () => firstValueFrom(next.handle())));
  }
}
