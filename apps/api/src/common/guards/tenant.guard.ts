import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Guard que valida que el tenant existe y está activo.
 * Se ejecuta DESPUÉS del TenantMiddleware.
 *
 * Si el tenant no existe o está suspendido, rechaza la request.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no identificado en la request');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true, slug: true },
    });

    if (!tenant) {
      this.logger.warn(`Tenant no encontrado: ${tenantId}`);
      throw new ForbiddenException('Tenant no encontrado');
    }

    if (tenant.status === 'SUSPENDED') {
      this.logger.warn(`Tenant suspendido: ${tenant.slug}`);
      throw new ForbiddenException(
        'La cuenta de esta clínica ha sido suspendida. Contacte al administrador.',
      );
    }

    return true;
  }
}
