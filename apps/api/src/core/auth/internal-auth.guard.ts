import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Role } from '@shopy/shared';
import type { SessionUser } from './auth.guard';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: SessionUser;
    }>();

    const expectedSecret = process.env.API_INTERNAL_SECRET || 'shopy-internal-secret';
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

    return true;
  }
}
