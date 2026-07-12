import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_HIERARCHY } from '@shopy/shared';
import type { Role } from '@shopy/shared';
import type { SessionUser } from './auth.guard';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: SessionUser;
    }>();

    const expectedSecret = process.env.API_INTERNAL_SECRET;
    if (!expectedSecret) {
      throw new UnauthorizedException('Internal API authentication is not configured');
    }
    const providedSecret = request.headers['x-internal-secret'];

    if (providedSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid internal API secret');
    }

    const id = request.headers['x-user-id'];
    const email = request.headers['x-user-email'];
    const role = request.headers['x-user-role'] as Role | undefined;
    const organizationId = request.headers['x-organization-id'];
    const name = request.headers['x-user-name'] ?? null;

    if (!id || !email || !role || !organizationId) {
      throw new UnauthorizedException('Missing user context');
    }

    request.user = {
      id,
      name,
      email,
      role,
      organizationId,
    };

    const requiredRole = this.reflector.getAllAndOverride<Role>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRole && ROLE_HIERARCHY[role] < ROLE_HIERARCHY[requiredRole]) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
