import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@simplecite/shared';

export const ROLES_KEY = 'roles';

/**
 * Restringe el acceso a un endpoint a los roles especificados.
 * Requiere que JwtAuthGuard haya corrido antes (inyecta request.user).
 *
 * Uso:
 *   @Roles('ADMIN', 'STAFF')
 *   @Get('appointments')
 *   listAll() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
