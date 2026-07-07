import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import { ROLES_KEY } from './roles.decorator';
import { ROLE_HIERARCHY } from '@shopy/shared';
import type { Role } from '@shopy/shared';

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  organizationId: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: SessionUser;
    }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authentication token');
    }

    const token = authHeader.slice(7);
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret');

    try {
      const { payload } = await jwtVerify(token, secret);

      if (!payload.sub || !payload.role || !payload.organizationId) {
        throw new UnauthorizedException('Invalid token payload');
      }

      request.user = {
        id: payload.sub,
        name: (payload.name as string) ?? null,
        email: payload.email as string,
        role: payload.role as Role,
        organizationId: payload.organizationId as string,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Check roles if @RequireRole() is present
    const requiredRole = this.reflector.getAllAndOverride<Role>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRole) {
      const userRole = request.user!.role;
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[requiredRole]) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return true;
  }
}
