import { Controller, Post, Body, BadRequestException, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../../../common/decorators/public.decorator';
import { CurrentTenant } from '../../../../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { LoginSchema, type LoginDto } from '@simplecite/shared';
import { AuthService } from '../../application/services/auth.service';
import { SESSION_COOKIE, sessionCookieOptions } from './session-cookie';

/**
 * Todas las rutas de auth son públicas — no requieren JWT previo.
 *
 * El tenantId se resuelve por TenantMiddleware (en orden de prioridad):
 *   - Header x-tenant-id  (UUID directo)
 *   - Header x-tenant-slug (slug → lookup)
 *   - Subdominio del host
 * Esto permite usar cualquiera de los tres desde curl/Postman/frontend.
 */
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Anti fuerza-bruta: mucho más estricto que el rate limit global. 10/min por
  // IP y no 5, porque en una clínica varios equipos comparten la IP pública y
  // un par de intentos fallidos del staff dejaba a los demás sin poder entrar.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
    @CurrentTenant() tenantId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!tenantId) {
      throw new BadRequestException(
        'Tenant no identificado. Usa el header x-tenant-slug o x-tenant-id.',
      );
    }

    const result = await this.authService.login(dto.email, dto.password, tenantId);
    // Sesión del panel en cookie httpOnly: el JS del navegador no puede leer
    // el token (mitiga robo por XSS). El accessToken se sigue devolviendo en el
    // body para curl/Postman, pero el panel ya no lo persiste.
    res.cookie(SESSION_COOKIE, result.accessToken, sessionCookieOptions(result.cookieMaxAgeMs));
    return { success: true, data: result };
  }

  /** Cierra la sesión del panel: borra la cookie httpOnly. */
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return { success: true };
  }
}
