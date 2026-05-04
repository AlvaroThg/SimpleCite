import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator para inyectar el tenant_id actual en los controladores.
 *
 * Uso:
 *   @Get()
 *   findAll(@CurrentTenant() tenantId: string) { ... }
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId;
  },
);
