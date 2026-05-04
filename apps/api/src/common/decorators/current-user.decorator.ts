import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator para inyectar el usuario autenticado en los controladores.
 *
 * Uso:
 *   @Get()
 *   getProfile(@CurrentUser() user: JwtPayload) { ... }
 *
 *   @Get()
 *   getUserId(@CurrentUser('sub') userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (data) {
      return user?.[data];
    }

    return user;
  },
);
