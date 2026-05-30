import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Logger } from 'nestjs-pino';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../../common/database/prisma.service';

export interface LoginResult {
  accessToken: string;
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
    // prisma.client usa el tx RLS-scoped si hay contexto activo (login route lo tiene vÃ­a interceptor)
    const user = await this.prisma.client.user.findFirst({
      where: { email, tenantId, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales invÃ¡lidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales invÃ¡lidas');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const accessToken = this.jwtService.sign(payload);

    this.logger.log({ tenantId, userId: user.id, email: user.email }, 'Login exitoso');

    return {
      accessToken,
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
