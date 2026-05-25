import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca una ruta como pública. Los guards globales (JwtAuthGuard,
 * TenantGuard, RolesGuard) saltean la validación para rutas marcadas.
 *
 * Uso:
 *   @Public()
 *   @Post('login')
 *   login() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
