import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../../../../common/database/prisma.service';
import { SESSION_COOKIE } from '../adapters/session-cookie';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
}

/** Extrae el JWT de la cookie httpOnly de sesión del panel (sin cookie-parser). */
function fromSessionCookie(req: Request): string | null {
  const raw = req?.headers?.cookie;
  if (!raw) return null;
  const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Estrategia JWT de Passport.
 * Extrae y valida el JWT del header Authorization: Bearer <token> o de la
 * cookie httpOnly de sesión (el panel usa la cookie; Bearer queda para
 * curl/Postman y compatibilidad con sesiones antiguas).
 * Inyecta el payload (incluyendo tenantId) en request.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET no está configurado');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        fromSessionCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Llamado automáticamente por Passport después de verificar la firma del JWT.
   * El valor retornado se inyecta en request.user.
   */
  async validate(payload: JwtPayload) {
    // Usar this.prisma directamente (no .client) — el validate() del JWT
    // corre desde JwtAuthGuard (guard) que se ejecuta ANTES del
    // TenantContextInterceptor (interceptor), por lo que no hay transacción
    // activa y `.client` puede retornar un tx incompleto de otra request.
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    };
  }
}
