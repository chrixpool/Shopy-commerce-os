import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string) {
    const [
      totalOrders,
      ordersByStatus,
      revenue,
      pendingConfirmation,
      readyToPack,
      inDelivery,
      lowStockProducts,
    ] = await Promise.all([
      this.prisma.order.count({ where: { organizationId } }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: {
          organizationId,
          status: { in: ['CONFIRMED', 'SHIPPED', 'DELIVERED'] },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.confirmationTask.count({
        where: {
          order: { organizationId },
          status: { in: ['PENDING', 'IN_PROGRESS', 'CALL_LATER'] },
        },
      }),
      this.prisma.fulfillmentTask.count({
        where: { order: { organizationId }, status: { in: ['TO_PACK', 'PACKING'] } },
      }),
      this.prisma.parcel.count({
        where: {
          order: { organizationId },
          status: { in: ['PENDING_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] },
        },
      }),
      this.prisma.product.count({
        where: {
          organizationId,
          isActive: true,
          stock: { lte: this.prisma.product.fields.lowStockThreshold },
        },
      }),
    ]);

    return {
      totalOrders,
      revenue: Number(revenue._sum.totalAmount ?? 0),
      workQueues: {
        pendingConfirmation,
        readyToPack,
        inDelivery,
        lowStockProducts,
      },
      ordersByStatus: ordersByStatus.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = item._count._all;
        return acc;
      }, {}),
      suggestions: [
        ...(pendingConfirmation > 0
          ? [
              {
                title: 'Prioritize confirmation',
                copy: `${pendingConfirmation} order(s) need a manual call or WhatsApp click.`,
              },
            ]
          : []),
        ...(readyToPack > 0
          ? [
              {
                title: 'Pack confirmed orders',
                copy: `${readyToPack} order(s) are ready for fulfillment.`,
              },
            ]
          : []),
        ...(inDelivery > 0
          ? [
              {
                title: 'Review active parcels',
                copy: `${inDelivery} parcel(s) are still in transit.`,
              },
            ]
          : []),
        ...(lowStockProducts > 0
          ? [
              {
                title: 'Restock low inventory',
                copy: `${lowStockProducts} product(s) are at or below threshold.`,
              },
            ]
          : []),
      ],
    };
  }
}
