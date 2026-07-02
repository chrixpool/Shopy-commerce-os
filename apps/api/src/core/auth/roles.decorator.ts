import { SetMetadata } from '@nestjs/common';
import type { Role } from '@shopy/shared';

export const ROLES_KEY = 'requiredRole';
export const RequireRole = (role: Role) => SetMetadata(ROLES_KEY, role);

export const Public = () => SetMetadata('isPublic', true);
