import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { SessionUser } from './auth.guard';

/**
 * @CurrentUser() — injects the validated session user into a controller method parameter.
 * Usage: async myMethod(@CurrentUser() user: SessionUser)
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => {
    const request = ctx.switchToHttp().getRequest<{ user: SessionUser }>();
    return request.user;
  },
);
