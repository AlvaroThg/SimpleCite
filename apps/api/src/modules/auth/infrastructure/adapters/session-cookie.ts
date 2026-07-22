import type { CookieOptions } from 'express';

/** Nombre de la cookie httpOnly que transporta el JWT del panel. */
export const SESSION_COOKIE = 'sc_session';

/**
 * Opciones de la cookie de sesión del panel.
 *
 * - httpOnly: el JS del navegador no puede leerla → un XSS no roba el token.
 * - sameSite lax: se envía en navegación normal, no en POSTs cross-site.
 * - secure solo en prod (en dev http://localhost no la aceptaría).
 * - domain `.APP_DOMAIN` en prod para compartirla entre app y api.<dominio>.
 */
export function sessionCookieOptions(maxAgeMs?: number): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const appDomain = process.env.APP_DOMAIN;
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    ...(isProd && appDomain ? { domain: `.${appDomain}` } : {}),
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

/** TTL corto de la cookie — espejo del JWT_EXPIRATION por defecto (12h). */
export const SESSION_COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** TTL largo ("mantener sesión iniciada"): 30 días. Activable por clínica. */
export const SESSION_COOKIE_EXTENDED_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Vida del JWT extendido en formato jsonwebtoken (debe empatar con el anterior). */
export const JWT_EXTENDED_EXPIRATION = '30d';
