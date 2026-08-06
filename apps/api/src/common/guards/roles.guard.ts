import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { UserRole } from '@simplecite/shared';

/**
 * Guard de RBAC. Verifica que el usuario autenticado tenga alguno de los
 * roles requeridos declarados con @Roles(...).
 *
 * Orden de ejecución (todos registrados como APP_GUARD en este orden):
 *   1. JwtAuthGuard → inyecta request.user
 *   2. TenantGuard  → valida que el tenant está activo
 *   3. RolesGuard   → valida que el rol del usuario tiene acceso
 *
 * Si el endpoint no tiene @Roles(), cualquier usuario autenticado pasa.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // RBAC es de staff sobre HTTP; los updates del bot no tienen usuario.
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @Roles() declarado → cualquier usuario autenticado puede acceder
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;

    if (!requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException(
        `Acceso denegado. Se requiere rol: ${requiredRoles.join(' o ')}`,
      );
    }

    return true;
  }
}
