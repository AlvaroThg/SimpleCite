import { Controller, Post, Body, Headers, BadRequestException } from '@nestjs/common';
import { Public } from '../../../../common/decorators/public.decorator';
import { AuthService } from '../../application/services/auth.service';

class LoginDto {
  email!: string;
  password!: string;
}

/**
 * Todas las rutas de auth son pÃºblicas â€” no requieren JWT previo.
 * El tenantId se resuelve del header X-Tenant-ID o del subdominio.
 */
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/login
   * Autentica un usuario y retorna un JWT.
   *
   * Requiere header X-Tenant-ID o que el tenant se resuelva por subdominio.
   */
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Headers('x-tenant-id') tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('Se requiere el header X-Tenant-ID para autenticaciÃ³n');
    }

    const result = await this.authService.login(loginDto.email, loginDto.password, tenantId);

    return {
      success: true,
      data: result,
    };
  }
}
