import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../../modules/auth/infrastructure/adapters/session-cookie';

interface SessionUser {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
}

interface DecodedToken {
  iat?: number;
  exp?: number;
}

/** Lee el JWT de la cookie httpOnly de sesión (sin cookie-parser). */
function tokenFromCookie(req: Request): string | null {
  const raw = req?.headers?.cookie;
  if (!raw) return null;
  const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Sesión deslizante: en cada request autenticada por cookie, si al token le
 * queda menos de la mitad de su vida, lo reemite con la misma duración y
 * refresca la cookie. Así un usuario activo nunca se cae por expiración; uno
 * inactivo sí expira (la ventana solo se desliza con actividad).
 *
 * - Solo actúa sobre sesiones por cookie del panel (no sobre Bearer de
 *   curl/Postman ni sobre rutas públicas, donde no hay request.user).
 * - Conserva la duración original del token (12h normal / 30d extendida) sin
 *   necesitar nada extra en el payload: la deriva de (exp - iat).
 * - Nunca rompe la request: cualquier error en el refresh se ignora.
 */
@Injectable()
export class RollingSessionInterceptor implements NestInterceptor {
  constructor(private readonly jwt: JwtService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const user = req.user;
    const token = tokenFromCookie(req);

    if (user && token) {
      try {
        const decoded = this.jwt.decode(token) as DecodedToken | null;
        if (decoded?.iat && decoded?.exp) {
          const now = Math.floor(Date.now() / 1000);
          const total = decoded.exp - decoded.iat;
          const remaining = decoded.exp - now;
          if (total > 0 && remaining > 0 && remaining < total / 2) {
            const payload = {
              sub: user.sub,
              email: user.email,
              role: user.role,
              tenantId: user.tenantId,
            };
            const fresh = this.jwt.sign(payload, { expiresIn: total });
            const res = context.switchToHttp().getResponse<Response>();
            res.cookie(SESSION_COOKIE, fresh, sessionCookieOptions(total * 1000));
          }
        }
      } catch {
        // El refresh es best-effort: nunca debe tumbar la request.
      }
    }

    return next.handle();
  }
}
