import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { PrismaService } from '../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard que valida que el tenant existe y está activo.
 *
 * Orden: se ejecuta DESPUÉS de JwtAuthGuard (inyecta request.user
 * cuyo tenantId es la fuente de verdad para rutas autenticadas).
 *
 * Para rutas @Public() con tenantId resuelto por subdominio, el guard
 * también valida — eso protege el Web Booking portal.
 * Rutas @Public() sin tenantId (ej: health) pasan libremente.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.tenantId;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Rutas públicas sin tenant resuelto (health, etc.) pasan sin validación
    if (isPublic && !tenantId) return true;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no identificado en la request');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true, slug: true },
    });

    if (!tenant) {
      this.logger.warn(`Tenant no encontrado: ${tenantId}`);
      throw new ForbiddenException('Clínica no encontrada');
    }

    if (tenant.status === 'SUSPENDED') {
      this.logger.warn(`Tenant suspendido: ${tenant.slug}`);
      throw new ForbiddenException(
        'La cuenta de esta clínica ha sido suspendida. Contacte al administrador.',
      );
    }

    // Inyectar tenant en request para que controladores lo consuman
    request.tenant = tenant;
    return true;
  }
}
