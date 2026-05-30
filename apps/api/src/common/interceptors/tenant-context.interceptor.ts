import type { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { from, firstValueFrom } from 'rxjs';
import { PrismaService } from '../database/prisma.service';

/**
 * Interceptor que activa el tenant context para toda la request.
 *
 * Envuelve la ejecuciÃ³n del handler en una transacciÃ³n Prisma con
 * `set_config('app.current_tenant_id', tenantId, true)`. Esto:
 *   1. Activa las polÃ­ticas RLS de PostgreSQL para el tenant correcto.
 *   2. Garantiza que cualquier query lanzada vÃ­a `prisma.client.*`
 *      participe de la misma transacciÃ³n (snapshot consistente).
 *
 * Requiere que TenantMiddleware haya poblado `request.tenantId` antes.
 * Si no hay tenantId (ej: health check, login pÃºblico), no envuelve nada.
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

    return from(this.prisma.runWithTenantContext(tenantId, () => firstValueFrom(next.handle())));
  }
}
