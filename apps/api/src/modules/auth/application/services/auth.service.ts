import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Logger } from 'nestjs-pino';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../../common/database/prisma.service';
import {
  SESSION_COOKIE_MAX_AGE_MS,
  SESSION_COOKIE_EXTENDED_MAX_AGE_MS,
  JWT_EXTENDED_EXPIRATION,
} from '../../infrastructure/adapters/session-cookie';

export interface LoginResult {
  accessToken: string;
  /// TTL que debe usar la cookie (empata con la vida del JWT firmado).
  cookieMaxAgeMs: number;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly logger: Logger,
  ) {}

  async login(email: string, password: string, tenantId: string): Promise<LoginResult> {
    // prisma.client usa el tx RLS-scoped si hay contexto activo (login route lo
    // tiene vía interceptor). El `select` es explícito: sin él la fila entera
    // —incluido el hash— queda a un `return user` de distancia de la respuesta.
    const [user, tenant] = await Promise.all([
      this.prisma.client.user.findFirst({
        where: { email, tenantId, isActive: true },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          tenantId: true,
          password: true, // solo para bcrypt.compare; nunca sale de este método
        },
      }),
      this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
        select: { extendedSession: true, extendedSessionAdminOnly: true },
      }),
    ]);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    // Sesión extendida (30 días) si la clínica la activó. Con adminOnly=true la
    // sesión larga es solo para el ADMIN; el resto del staff expira normal.
    const extended =
      tenant?.extendedSession === true &&
      (!tenant.extendedSessionAdminOnly || user.role === 'ADMIN');
    const accessToken = extended
      ? this.jwtService.sign(payload, { expiresIn: JWT_EXTENDED_EXPIRATION })
      : this.jwtService.sign(payload);
    const cookieMaxAgeMs = extended
      ? SESSION_COOKIE_EXTENDED_MAX_AGE_MS
      : SESSION_COOKIE_MAX_AGE_MS;

    this.logger.log({ tenantId, userId: user.id, email: user.email, extended }, 'Login exitoso');

    return {
      accessToken,
      cookieMaxAgeMs,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }
}
