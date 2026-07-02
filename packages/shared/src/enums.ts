// ─── ENUMS ─────────────────────────────────────────────────────────────────

export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  CONFIRMER = 'CONFIRMER',
  PACKER = 'PACKER',
  DELIVERER = 'DELIVERER',
  CAMPAIGN_MANAGER = 'CAMPAIGN_MANAGER',
  VIEWER = 'VIEWER',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REFUSED = 'REFUSED',
  CANCELLED = 'CANCELLED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
}

export enum ConfirmationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  CONFIRMED = 'CONFIRMED',
  REFUSED = 'REFUSED',
  UNREACHABLE = 'UNREACHABLE',
  CALL_LATER = 'CALL_LATER',
}

export enum FulfillmentStatus {
  TO_PACK = 'TO_PACK',
  PACKING = 'PACKING',
  PACKED = 'PACKED',
}

export enum DeliveryStatus {
  PENDING_PICKUP = 'PENDING_PICKUP',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  FAILED_ATTEMPT = 'FAILED_ATTEMPT',
  RETURNED = 'RETURNED',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

// ─── ROLE PERMISSIONS ──────────────────────────────────────────────────────

export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.OWNER]: 100,
  [Role.ADMIN]: 80,
  [Role.CAMPAIGN_MANAGER]: 60,
  [Role.CONFIRMER]: 40,
  [Role.PACKER]: 40,
  [Role.DELIVERER]: 40,
  [Role.VIEWER]: 10,
};

export function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
