import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard JWT global. Valida el Bearer token en cada request.
 * Rutas marcadas con @Public() pasan sin validaciÃ³n.
 *
 * Registrado como APP_GUARD en AppModule â†’ cubre TODOS los endpoints
 * sin necesidad de aplicarlo uno por uno.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Solo aplica a HTTP: los updates del bot (contexto 'telegraf') no traen
    // Bearer ni cookie; su "autenticación" es el token del bot en el polling.
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
