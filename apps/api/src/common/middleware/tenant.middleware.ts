import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../database/prisma.service';

/**
 * Middleware que resuelve el tenant de cada request.
 *
 * Estrategias de resolución (en orden de prioridad):
 *   1. Header `X-Tenant-ID` (UUID directo — para desarrollo y API calls)
 *   2. Subdominio del `Host` header (ej: clinica-demo.simplecite.com.bo → slug "clinica-demo")
 *   3. JWT claim `tenant_id` (si el usuario ya está autenticado)
 *
 * El tenantId se inyecta en `request.tenantId` para que esté disponible
 * en Guards, Decorators y Controllers.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    let tenantId: string | undefined;

    // Estrategia 1: Header directo
    const headerTenantId = req.headers['x-tenant-id'] as string;
    if (headerTenantId) {
      tenantId = headerTenantId;
      this.logger.debug(`Tenant resuelto por header: ${tenantId}`);
    }

    // Estrategia 2: Subdominio
    if (!tenantId) {
      const host = req.headers.host || '';
      const appDomain = process.env.APP_DOMAIN || 'simplecite.com.bo';

      // Extraer subdominio: "clinica-demo.simplecite.com.bo" → "clinica-demo"
      if (host.endsWith(appDomain) && host !== appDomain) {
        const slug = host.replace(`.${appDomain}`, '').split(':')[0];

        if (slug && slug !== 'www' && slug !== 'api') {
          const tenant = await this.prisma.tenant.findUnique({
            where: { slug },
            select: { id: true },
          });

          if (tenant) {
            tenantId = tenant.id;
            this.logger.debug(`Tenant resuelto por subdominio "${slug}": ${tenantId}`);
          }
        }
      }
    }

    // Estrategia 3: JWT claim (fallback)
    if (!tenantId && (req as any).user?.tenantId) {
      tenantId = (req as any).user.tenantId;
      this.logger.debug(`Tenant resuelto por JWT: ${tenantId}`);
    }

    // Inyectar en la request
    (req as any).tenantId = tenantId;
    next();
  }
}
