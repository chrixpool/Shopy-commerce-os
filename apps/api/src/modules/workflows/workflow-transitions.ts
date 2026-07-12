import { BadRequestException } from '@nestjs/common';
import { ConfirmationStatus, DeliveryStatus, FulfillmentStatus, OrderStatus } from '@prisma/client';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.REFUSED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  REFUSED: [],
  CANCELLED: [],
  SHIPPED: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
  DELIVERED: [],
  RETURNED: [],
};

const CONFIRMATION_TRANSITIONS: Record<ConfirmationStatus, ConfirmationStatus[]> = {
  PENDING: [
    ConfirmationStatus.IN_PROGRESS,
    ConfirmationStatus.CONFIRMED,
    ConfirmationStatus.REFUSED,
    ConfirmationStatus.UNREACHABLE,
    ConfirmationStatus.CALL_LATER,
  ],
  IN_PROGRESS: [
    ConfirmationStatus.CONFIRMED,
    ConfirmationStatus.REFUSED,
    ConfirmationStatus.UNREACHABLE,
    ConfirmationStatus.CALL_LATER,
  ],
  CALL_LATER: [
    ConfirmationStatus.IN_PROGRESS,
    ConfirmationStatus.CONFIRMED,
    ConfirmationStatus.REFUSED,
    ConfirmationStatus.UNREACHABLE,
  ],
  UNREACHABLE: [
    ConfirmationStatus.IN_PROGRESS,
    ConfirmationStatus.CALL_LATER,
    ConfirmationStatus.CONFIRMED,
    ConfirmationStatus.REFUSED,
  ],
  CONFIRMED: [],
  REFUSED: [],
};

const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  TO_PACK: [FulfillmentStatus.PACKING, FulfillmentStatus.PACKED],
  PACKING: [FulfillmentStatus.PACKED],
  PACKED: [],
};

const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING_PICKUP: [
    DeliveryStatus.PICKED_UP,
    DeliveryStatus.IN_TRANSIT,
    DeliveryStatus.FAILED_ATTEMPT,
    DeliveryStatus.RETURNED,
  ],
  PICKED_UP: [
    DeliveryStatus.IN_TRANSIT,
    DeliveryStatus.OUT_FOR_DELIVERY,
    DeliveryStatus.FAILED_ATTEMPT,
    DeliveryStatus.RETURNED,
  ],
  IN_TRANSIT: [
    DeliveryStatus.OUT_FOR_DELIVERY,
    DeliveryStatus.DELIVERED,
    DeliveryStatus.FAILED_ATTEMPT,
    DeliveryStatus.RETURNED,
  ],
  OUT_FOR_DELIVERY: [
    DeliveryStatus.DELIVERED,
    DeliveryStatus.FAILED_ATTEMPT,
    DeliveryStatus.RETURNED,
  ],
  FAILED_ATTEMPT: [DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.RETURNED],
  DELIVERED: [],
  RETURNED: [],
};

export function assertOrderTransition(from: OrderStatus, to: OrderStatus) {
  assertTransition('order', from, to, ORDER_TRANSITIONS);
}

export function assertConfirmationTransition(from: ConfirmationStatus, to: ConfirmationStatus) {
  assertTransition('confirmation', from, to, CONFIRMATION_TRANSITIONS);
}

export function assertFulfillmentTransition(from: FulfillmentStatus, to: FulfillmentStatus) {
  assertTransition('fulfillment', from, to, FULFILLMENT_TRANSITIONS);
}

export function assertDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus) {
  assertTransition('delivery', from, to, DELIVERY_TRANSITIONS);
}

function assertTransition<T extends string>(
  label: string,
  from: T,
  to: T,
  allowed: Record<T, T[]>,
) {
  if (from === to) return;
  if (!allowed[from]?.includes(to)) {
    throw new BadRequestException(`Cannot move ${label} from ${from} to ${to}.`);
  }
}
