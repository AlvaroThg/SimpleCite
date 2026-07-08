import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../database/prisma.service';

/**
 * Middleware que resuelve el tenant de cada request.
 *
 * Estrategias de resolución (en orden de prioridad):
 *   0. **Path público**: `/api/public/tenants/:slug/...` — slug viene en la URL.
 *      Tiene prioridad absoluta para que un atacante no pueda forzar otro tenant
 *      vía header en una ruta pública.
 *   1. Header `X-Tenant-ID` (UUID directo — para desarrollo y API calls)
 *   2. Subdominio del `Host` header (ej: clinica-demo.simplecite.com.bo → "clinica-demo")
 *   3. JWT claim `tenant_id` (si el usuario ya está autenticado)
 *
 * El tenantId se inyecta en `request.tenantId` para que esté disponible
 * en Guards, Decorators y Controllers. El TenantContextInterceptor lo usa
 * para abrir la transacción RLS-scoped vía `set_config('app.current_tenant_id')`.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  /** Captura el slug en /api/public/tenants/:slug[/...] */
  private static readonly PUBLIC_PATH_RE = /^\/api\/public\/tenants\/([a-z0-9-]+)(?:\/|$)/;

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    let tenantId: string | undefined;

    // ─── Estrategia 0: Path público ────────────────────────────────
    // Si la ruta es /api/public/tenants/:slug/..., el slug es autoridad.
    // Bypaseamos las demás estrategias para que nadie pueda spoofear vía header.
    // OJO: setGlobalPrefix('api') strippea el prefix de req.path dentro del
    // middleware NestJS (queda como "/"). Usamos req.originalUrl que sí lo conserva.
    const pathMatch = TenantMiddleware.PUBLIC_PATH_RE.exec(req.originalUrl || req.path);
    if (pathMatch) {
      const slug = pathMatch[1];
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true, status: true },
      });
      if (tenant && tenant.status !== 'SUSPENDED') {
        tenantId = tenant.id;
        this.logger.debug(`Tenant resuelto por path público "${slug}": ${tenantId}`);
      }
      req.tenantId = tenantId;
      return next();
    }

    // ─── Estrategia 1a: Header x-tenant-id (UUID directo) ────────────
    const headerTenantId = req.headers['x-tenant-id'] as string;
    if (headerTenantId) {
      tenantId = headerTenantId;
      this.logger.debug(`Tenant resuelto por x-tenant-id: ${tenantId}`);
    }

    // ─── Estrategia 1b: Header x-tenant-slug (lookup por slug) ────────
    // Útil para clientes API, Postman y tests — evita tener que conocer el UUID.
    if (!tenantId) {
      const headerSlug = req.headers['x-tenant-slug'] as string | undefined;
      if (headerSlug) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { slug: headerSlug },
          select: { id: true },
        });
        if (tenant) {
          tenantId = tenant.id;
          this.logger.debug(`Tenant resuelto por x-tenant-slug "${headerSlug}": ${tenantId}`);
        }
      }
    }

    // ─── Estrategia 2: Subdominio ──────────────────────────────────
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

    // ─── Estrategia 3: JWT claim (fallback) ────────────────────────
    const jwtUser = (req as { user?: { tenantId?: string } }).user;
    if (!tenantId && jwtUser?.tenantId) {
      tenantId = jwtUser.tenantId;
      this.logger.debug(`Tenant resuelto por JWT: ${tenantId}`);
    }

    req.tenantId = tenantId;
    next();
  }
}
