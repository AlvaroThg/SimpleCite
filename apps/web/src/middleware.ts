import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware de resolución de tenant por subdominio.
 *
 * En producción (clinica-demo.simplecite.com.bo):
 *   - Extrae el slug del subdominio.
 *   - Reescribe la URL internamente a /{slug}{path} para que el App Router
 *     use la ruta dinámica [slug].
 *   - Inyecta el slug en el header `x-tenant-slug` para que los layouts
 *     lo lean sin parsear la URL de nuevo.
 *
 * En desarrollo (localhost:3000):
 *   - No hay subdominio → el usuario navega directamente a /clinica-demo/...
 *   - El middleware pasa sin modificar la URL pero propaga x-tenant-slug
 *     leyendo el primer segmento del path.
 *
 * Rutas excluidas: Next.js internals (_next), assets estáticos, favicon.
 */
/** Primeros segmentos reservados que NO son slugs de tenant. */
const RESERVED = new Set(['www', 'api', 'app', 'panel', '_next', 'favicon.ico']);

export function middleware(req: NextRequest) {
  const { hostname, pathname } = req.nextUrl;

  // El panel profesional (/panel) no pertenece a ningún tenant: no resolver slug.
  if (pathname === '/panel' || pathname.startsWith('/panel/')) {
    return NextResponse.next();
  }

  // ─── Producción: resolución por subdominio ────────────────────────
  const appDomain = process.env.APP_DOMAIN ?? 'simplecite.com.bo';
  if (hostname !== 'localhost' && hostname.endsWith(`.${appDomain}`)) {
    const slug = hostname.replace(`.${appDomain}`, '').split(':')[0];

    if (slug && !RESERVED.has(slug)) {
      // Reescribir internamente: clinica-demo.simplecite.com.bo/booking
      //                      →  simplecite.com.bo/clinica-demo/booking
      const rewriteUrl = req.nextUrl.clone();
      rewriteUrl.pathname = `/${slug}${pathname === '/' ? '' : pathname}`;

      const res = NextResponse.rewrite(rewriteUrl);
      res.headers.set('x-tenant-slug', slug);
      return res;
    }
  }

  // ─── Desarrollo: slug ya en el path (/clinica-demo/...) ──────────
  const slugFromPath = pathname.split('/')[1];
  if (
    slugFromPath &&
    !RESERVED.has(slugFromPath) &&
    !slugFromPath.startsWith('_') &&
    !/\.[a-z]+$/.test(slugFromPath) // no es un asset estático
  ) {
    const res = NextResponse.next();
    res.headers.set('x-tenant-slug', slugFromPath);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Excluir:
     *   - /_next/...  (assets de Next.js)
     *   - /favicon.ico, /robots.txt, etc.
     *   - Archivos estáticos con extensión
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)',
  ],
};
