import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { Public } from '../../../../common/decorators/public.decorator';
import { CurrentTenant } from '../../../../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { LoginSchema, type LoginDto } from '@simplecite/shared';
import { AuthService } from '../../application/services/auth.service';

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

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
    @CurrentTenant() tenantId: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException(
        'Tenant no identificado. Usa el header x-tenant-slug o x-tenant-id.',
      );
    }

    const result = await this.authService.login(dto.email, dto.password, tenantId);
    return { success: true, data: result };
  }
}
