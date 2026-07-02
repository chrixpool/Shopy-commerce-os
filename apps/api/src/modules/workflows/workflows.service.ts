import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfirmationStatus, DeliveryStatus, FulfillmentStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ConfirmationAction } from './dto/update-confirmation.dto';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  listConfirmation(organizationId: string) {
    return this.prisma.confirmationTask.findMany({
      where: { order: { organizationId } },
      include: { order: { include: { customer: true } }, assignedTo: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async updateConfirmation(
    organizationId: string,
    userId: string,
    id: string,
    action: ConfirmationAction,
  ) {
    const task = await this.prisma.confirmationTask.findFirst({
      where: { id, order: { organizationId } },
      include: { order: true },
    });
    if (!task) throw new NotFoundException('Confirmation task not found');

    const taskStatus =
      action === ConfirmationAction.CONFIRMED
        ? ConfirmationStatus.CONFIRMED
        : action === ConfirmationAction.UNREACHABLE
          ? ConfirmationStatus.UNREACHABLE
          : ConfirmationStatus.UNREACHABLE;
    const orderStatus =
      action === ConfirmationAction.CONFIRMED
        ? OrderStatus.CONFIRMED
        : action === ConfirmationAction.CANCELLED
          ? OrderStatus.CANCELLED
          : task.order.status;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.confirmationTask.update({
        where: { id },
        data: { status: taskStatus, attempts: { increment: 1 } },
        include: { order: { include: { customer: true } }, assignedTo: true },
      });

      await tx.order.update({
        where: { id: task.orderId },
        data: {
          status: orderStatus,
          events: {
            create: {
              type: 'confirmation_action',
              userId,
              note: `Confirmation marked ${action.toLowerCase()}`,
              data: { action, from: task.order.status, to: orderStatus },
            },
          },
        },
      });

      if (action === ConfirmationAction.CONFIRMED) {
        await tx.fulfillmentTask.upsert({
          where: { orderId: task.orderId },
          update: { status: FulfillmentStatus.TO_PACK },
          create: { orderId: task.orderId, status: FulfillmentStatus.TO_PACK },
        });
      }

      return updated;
    });
  }

  listFulfillment(organizationId: string) {
    return this.prisma.fulfillmentTask.findMany({
      where: { order: { organizationId } },
      include: {
        order: { include: { customer: true, items: { include: { product: true } } } },
        assignedTo: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async updateFulfillment(
    organizationId: string,
    userId: string,
    id: string,
    status: FulfillmentStatus,
  ) {
    const task = await this.prisma.fulfillmentTask.findFirst({
      where: { id, order: { organizationId } },
      include: { order: { include: { items: true } } },
    });
    if (!task) throw new NotFoundException('Fulfillment task not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.fulfillmentTask.update({
        where: { id },
        data: {
          status,
          packedAt: status === FulfillmentStatus.PACKED ? new Date() : null,
        },
        include: {
          order: { include: { customer: true, items: { include: { product: true } } } },
          assignedTo: true,
        },
      });

      if (status === FulfillmentStatus.PACKED && task.status !== FulfillmentStatus.PACKED) {
        for (const item of task.order.items) {
          if (!item.productId) continue;

          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
          await tx.inventoryRecord.create({
            data: {
              productId: item.productId,
              type: 'OUT',
              quantity: -item.quantity,
              reason: 'Fulfilled order',
              reference: task.orderId,
            },
          });
        }
      }

      await tx.order.update({
        where: { id: task.orderId },
        data: {
          status: status === FulfillmentStatus.PACKED ? OrderStatus.SHIPPED : task.order.status,
          events: {
            create: {
              type: 'fulfillment_action',
              userId,
              note: `Fulfillment marked ${status.toLowerCase()}`,
              data: { from: task.status, to: status },
            },
          },
        },
      });

      if (status === FulfillmentStatus.PACKED) {
        const parcel = await tx.parcel.upsert({
          where: { orderId: task.orderId },
          update: { status: DeliveryStatus.PENDING_PICKUP, codAmount: task.order.totalAmount },
          create: {
            orderId: task.orderId,
            status: DeliveryStatus.PENDING_PICKUP,
            codAmount: task.order.totalAmount,
            trackingNumber: `OPS-${task.orderId.slice(-8).toUpperCase()}`,
          },
        });
        await tx.parcelEvent.create({
          data: {
            parcelId: parcel.id,
            status: DeliveryStatus.PENDING_PICKUP,
            note: 'Parcel created from packed order',
          },
        });
      }

      return updated;
    });
  }

  listDelivery(organizationId: string) {
    return this.prisma.parcel.findMany({
      where: { order: { organizationId } },
      include: {
        order: { include: { customer: true } },
        events: { orderBy: { timestamp: 'desc' }, take: 3 },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async updateDelivery(organizationId: string, userId: string, id: string, status: DeliveryStatus) {
    const parcel = await this.prisma.parcel.findFirst({
      where: { id, order: { organizationId } },
      include: { order: true },
    });
    if (!parcel) throw new NotFoundException('Parcel not found');

    const orderStatus =
      status === DeliveryStatus.DELIVERED
        ? OrderStatus.DELIVERED
        : status === DeliveryStatus.RETURNED
          ? OrderStatus.RETURNED
          : parcel.order.status;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.parcel.update({
        where: { id },
        data: {
          status,
          codCollected: status === DeliveryStatus.DELIVERED,
          events: {
            create: {
              status,
              note: `Delivery marked ${status.toLowerCase()}`,
            },
          },
        },
        include: {
          order: { include: { customer: true } },
          events: { orderBy: { timestamp: 'desc' }, take: 3 },
        },
      });

      await tx.order.update({
        where: { id: parcel.orderId },
        data: {
          status: orderStatus,
          events: {
            create: {
              type: 'delivery_action',
              userId,
              note: `Parcel marked ${status.toLowerCase()}`,
              data: { from: parcel.status, to: status, orderStatus },
            },
          },
        },
      });

      return updated;
    });
  }
}
