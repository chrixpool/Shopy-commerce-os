import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfirmationStatus, DeliveryStatus, FulfillmentStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ConfirmationAction, UpdateConfirmationDto } from './dto/update-confirmation.dto';
import {
  assertConfirmationTransition,
  assertDeliveryTransition,
  assertFulfillmentTransition,
  assertOrderTransition,
} from './workflow-transitions';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async listConfirmation(
    organizationId: string,
    query: { page?: number; limit?: number; status?: string; search?: string } = {},
  ) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 25), 1), 50);
    const requestedStatus = query.status ?? 'actionable';
    const status =
      requestedStatus !== 'all' && requestedStatus !== 'actionable'
        ? (requestedStatus as ConfirmationStatus)
        : undefined;
    const search = query.search?.trim();
    const where = {
      ...(status
        ? { status }
        : requestedStatus === 'actionable'
          ? { status: { in: ['PENDING', 'IN_PROGRESS', 'CALL_LATER'] as ConfirmationStatus[] } }
          : {}),
      order: {
        organizationId,
        ...(requestedStatus === 'actionable' ? { status: OrderStatus.PENDING } : {}),
        ...(search
          ? {
              OR: [
                { orderNumber: { contains: search } },
                { customerName: { contains: search } },
                { customerPhone: { contains: search } },
                { customer: { city: { contains: search } } },
              ],
            }
          : {}),
      },
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [data, total, summary, actionable, confirmedToday, cancelled] = await Promise.all([
      this.prisma.confirmationTask.findMany({
        where,
        include: {
          order: {
            include: {
              customer: true,
              _count: { select: { items: true } },
              events: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
          },
          assignedTo: true,
        },
        orderBy: [{ createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.confirmationTask.count({ where }),
      this.prisma.confirmationTask.groupBy({
        by: ['status'],
        where: { order: { organizationId } },
        _count: { _all: true },
      }),
      this.prisma.confirmationTask.findMany({
        where: {
          order: { organizationId, status: OrderStatus.PENDING },
          status: { in: ['PENDING', 'IN_PROGRESS', 'CALL_LATER'] },
        },
        select: { createdAt: true },
        take: 5000,
      }),
      this.prisma.confirmationTask.count({
        where: { order: { organizationId }, status: 'CONFIRMED', updatedAt: { gte: today } },
      }),
      this.prisma.order.count({ where: { organizationId, status: 'CANCELLED' } }),
    ]);

    const byStatus = summary.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    return {
      data: data.map((task) => {
        const ageHours = Math.max((Date.now() - task.createdAt.getTime()) / 36e5, 0);
        const priority =
          ageHours >= 48 || Number(task.order.totalAmount) >= 150
            ? 'HIGH'
            : ageHours >= 24 || task.attempts > 0
              ? 'MEDIUM'
              : 'NORMAL';
        return {
          ...task,
          ageHours,
          overdue: ageHours >= 24,
          priority,
          lastAction: task.order.events[0]?.note ?? null,
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      summary: byStatus,
      metrics: {
        actionable: actionable.length,
        confirmedToday,
        cancelled,
        averageWaitingHours: actionable.length
          ? actionable.reduce(
              (totalHours, task) => totalHours + (Date.now() - task.createdAt.getTime()) / 36e5,
              0,
            ) / actionable.length
          : 0,
        overdueSla: actionable.filter((task) => Date.now() - task.createdAt.getTime() >= 24 * 36e5)
          .length,
        confirmationRate:
          (byStatus.CONFIRMED ?? 0) + (byStatus.REFUSED ?? 0) > 0
            ? (byStatus.CONFIRMED ?? 0) / ((byStatus.CONFIRMED ?? 0) + (byStatus.REFUSED ?? 0))
            : null,
      },
    };
  }

  async updateConfirmation(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateConfirmationDto,
  ) {
    const action = dto.action;
    const task = await this.prisma.confirmationTask.findFirst({
      where: { id, order: { organizationId } },
      include: { order: true },
    });
    if (!task) throw new NotFoundException('Confirmation task not found');

    const taskStatus = confirmationTaskStatus(action);
    const orderStatus =
      action === ConfirmationAction.CONFIRMED
        ? OrderStatus.CONFIRMED
        : action === ConfirmationAction.CANCELLED
          ? OrderStatus.CANCELLED
          : action === ConfirmationAction.REFUSED
            ? OrderStatus.REFUSED
            : task.order.status;

    assertConfirmationTransition(task.status, taskStatus);
    if (task.order.status !== orderStatus) assertOrderTransition(task.order.status, orderStatus);

    if (task.status === taskStatus && task.order.status === orderStatus) return task;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.confirmationTask.update({
        where: { id },
        data: {
          status: taskStatus,
          attempts: { increment: 1 },
          ...(dto.note !== undefined ? { notes: dto.note.trim() || null } : {}),
          ...(dto.scheduledAt ? { scheduledAt: new Date(dto.scheduledAt) } : {}),
        },
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
              data: {
                action,
                from: task.order.status,
                to: orderStatus,
                scheduledAt: dto.scheduledAt ?? null,
              },
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
    assertFulfillmentTransition(task.status, status);

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
    assertDeliveryTransition(parcel.status, status);

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

  async reconciliation(organizationId: string) {
    const orders = await this.prisma.order.findMany({
      where: { organizationId, source: 'shopify' },
      select: {
        id: true,
        status: true,
        confirmationTask: { select: { id: true, status: true } },
        fulfillmentTask: { select: { id: true, status: true } },
      },
    });
    const result = reconciliationResult(orders);
    return { ...result, dryRun: true };
  }

  async repairReconciliation(
    organizationId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    const preview = body.execute !== true;
    if (!preview && body.confirm !== 'REPAIR_WORKFLOWS') {
      throw new BadRequestException('Execution requires confirm=REPAIR_WORKFLOWS.');
    }
    const orders = await this.prisma.order.findMany({
      where: { organizationId, source: 'shopify' },
      select: {
        id: true,
        status: true,
        confirmationTask: { select: { id: true, status: true } },
        fulfillmentTask: { select: { id: true, status: true } },
      },
    });
    const result = reconciliationResult(orders);
    if (preview) return { ...result, dryRun: true };

    const confirmationRows = orders.flatMap((order) => {
      const status = expectedConfirmationStatus(order.status);
      return !order.confirmationTask && status ? [{ orderId: order.id, status }] : [];
    });
    const fulfillmentRows = orders
      .filter((order) => !order.fulfillmentTask && order.status === OrderStatus.CONFIRMED)
      .map((order) => ({ orderId: order.id, status: FulfillmentStatus.TO_PACK }));
    const eventRows = [
      ...confirmationRows.map((row) => ({
        orderId: row.orderId,
        userId,
        type: 'workflow_reconciled',
        note: 'Missing confirmation task restored',
        data: { task: 'confirmation', status: row.status },
      })),
      ...fulfillmentRows.map((row) => ({
        orderId: row.orderId,
        userId,
        type: 'workflow_reconciled',
        note: 'Missing fulfillment task restored',
        data: { task: 'fulfillment', status: row.status },
      })),
    ];
    const [confirmationResult, fulfillmentResult] = await this.prisma.$transaction([
      this.prisma.confirmationTask.createMany({ data: confirmationRows, skipDuplicates: true }),
      this.prisma.fulfillmentTask.createMany({ data: fulfillmentRows, skipDuplicates: true }),
      this.prisma.orderEvent.createMany({ data: eventRows }),
    ]);
    return {
      ...result,
      dryRun: false,
      created: {
        confirmationTasks: confirmationResult.count,
        fulfillmentTasks: fulfillmentResult.count,
      },
    };
  }
}

type ReconciliationOrder = {
  status: OrderStatus;
  confirmationTask: { id: string; status: ConfirmationStatus } | null;
  fulfillmentTask: { id: string; status: FulfillmentStatus } | null;
};

export function reconciliationResult(orders: ReconciliationOrder[]) {
  let missingConfirmationTasks = 0;
  let missingFulfillmentTasks = 0;
  let completedTasks = 0;
  let conflicts = 0;
  let skipped = 0;
  for (const order of orders) {
    const expectedConfirmation = expectedConfirmationStatus(order.status);
    if (!order.confirmationTask && expectedConfirmation) missingConfirmationTasks += 1;
    if (
      order.confirmationTask &&
      expectedConfirmation &&
      order.confirmationTask.status !== expectedConfirmation &&
      !new Set<ConfirmationStatus>([
        ConfirmationStatus.IN_PROGRESS,
        ConfirmationStatus.CALL_LATER,
        ConfirmationStatus.UNREACHABLE,
      ]).has(order.confirmationTask.status)
    )
      conflicts += 1;
    if (order.status === OrderStatus.CONFIRMED && !order.fulfillmentTask) {
      missingFulfillmentTasks += 1;
    } else if (order.fulfillmentTask?.status === FulfillmentStatus.PACKED) {
      completedTasks += 1;
    } else if (order.status !== OrderStatus.CONFIRMED) {
      skipped += 1;
    }
  }
  return {
    shopifyOrdersFound: orders.length,
    missingConfirmationTasks,
    missingFulfillmentTasks,
    workflowConflicts: conflicts,
    completedTasks,
    skippedRecords: skipped,
    invalidStatusCombinations: conflicts,
  };
}

function expectedConfirmationStatus(status: OrderStatus) {
  if (
    new Set<OrderStatus>([OrderStatus.CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED]).has(
      status,
    )
  ) {
    return ConfirmationStatus.CONFIRMED;
  }
  if (status === OrderStatus.REFUSED || status === OrderStatus.CANCELLED) {
    return ConfirmationStatus.REFUSED;
  }
  if (status === OrderStatus.PENDING) return ConfirmationStatus.PENDING;
  return null;
}

function confirmationTaskStatus(action: ConfirmationAction) {
  if (action === ConfirmationAction.CONFIRMED) return ConfirmationStatus.CONFIRMED;
  if (action === ConfirmationAction.UNREACHABLE) return ConfirmationStatus.UNREACHABLE;
  if (action === ConfirmationAction.CALL_LATER) return ConfirmationStatus.CALL_LATER;
  return ConfirmationStatus.REFUSED;
}
