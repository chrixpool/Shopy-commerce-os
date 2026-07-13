import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    organizationId: string,
    query: { range?: string; dateFrom?: string; dateTo?: string } = {},
  ) {
    const period = dashboardPeriod(query);
    const orderWhere: Prisma.OrderWhereInput = {
      organizationId,
      source: { not: 'smoke' },
      createdAt: period.current,
    };
    const previousOrderWhere: Prisma.OrderWhereInput = {
      organizationId,
      source: { not: 'smoke' },
      createdAt: period.previous,
    };
    const [
      totalOrders,
      ordersByStatus,
      revenue,
      totalOrderValue,
      pendingConfirmation,
      readyToPack,
      inDelivery,
      lowStockProducts,
      confirmationByStatus,
      deliveredOrders,
      returnedOrders,
      costSummary,
      productsMissingCost,
      ordersMissingCost,
      negativeMarginOrders,
      expenses,
      unmatchedShopifyItems,
      previousTotalOrders,
      previousRevenue,
    ] = await Promise.all([
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: orderWhere,
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: orderWhere,
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({ where: orderWhere, _sum: { totalAmount: true } }),
      this.prisma.confirmationTask.count({
        where: {
          order: { ...orderWhere, status: 'PENDING' },
          status: { in: ['PENDING', 'IN_PROGRESS', 'CALL_LATER'] },
        },
      }),
      this.prisma.fulfillmentTask.count({
        where: { order: orderWhere, status: { in: ['TO_PACK', 'PACKING'] } },
      }),
      this.prisma.parcel.count({
        where: {
          order: orderWhere,
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
      this.prisma.confirmationTask.groupBy({
        by: ['status'],
        where: { order: orderWhere },
        _count: { _all: true },
      }),
      this.prisma.order.count({ where: { ...orderWhere, status: 'DELIVERED' } }),
      this.prisma.order.count({ where: { ...orderWhere, status: 'RETURNED' } }),
      this.prisma.orderCostSnapshot.aggregate({
        where: { organizationId, order: { createdAt: period.current } },
        _sum: { grossMargin: true, totalCost: true, revenue: true },
        _count: { _all: true },
      }),
      this.prisma.product.count({
        where: { organizationId, isActive: true, productCosts: { none: { active: true } } },
      }),
      this.prisma.order.count({ where: { ...orderWhere, costSnapshot: null } }),
      this.prisma.orderCostSnapshot.count({
        where: { organizationId, order: { createdAt: period.current }, grossMargin: { lt: 0 } },
      }),
      this.prisma.operatingExpense.aggregate({
        where: { organizationId, active: true },
        _sum: { amount: true },
      }),
      this.prisma.orderItem.count({
        where: { order: { organizationId, source: 'shopify' }, productId: null },
      }),
      this.prisma.order.count({ where: previousOrderWhere }),
      this.prisma.order.aggregate({
        where: previousOrderWhere,
        _sum: { totalAmount: true },
      }),
    ]);

    const statusMap = ordersByStatus.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});
    const confirmationMap = confirmationByStatus.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});
    const confirmationDecisions =
      (confirmationMap.CONFIRMED ?? 0) +
      (confirmationMap.REFUSED ?? 0) +
      (confirmationMap.UNREACHABLE ?? 0);
    const deliveryDecisions = deliveredOrders + returnedOrders;
    const grossMargin = Number(costSummary._sum.grossMargin ?? 0);

    return {
      totalOrders,
      revenue: Number(revenue._sum.totalAmount ?? 0),
      totalOrderValue: Number(totalOrderValue._sum.totalAmount ?? 0),
      period: {
        key: period.key,
        from: period.current.gte?.toISOString(),
        to: period.current.lte?.toISOString(),
      },
      comparison: {
        ordersPercent: percentChange(totalOrders, previousTotalOrders),
        revenuePercent: percentChange(
          Number(revenue._sum.totalAmount ?? 0),
          Number(previousRevenue._sum.totalAmount ?? 0),
        ),
      },
      workQueues: {
        pendingConfirmation,
        readyToPack,
        inDelivery,
        lowStockProducts,
      },
      ordersByStatus: statusMap,
      funnel: {
        imported: totalOrders,
        pendingConfirmation,
        confirmed: statusMap.CONFIRMED ?? 0,
        packed: statusMap.SHIPPED ?? 0,
        dispatched: statusMap.SHIPPED ?? 0,
        delivered: deliveredOrders,
        failedOrReturned: returnedOrders + (statusMap.REFUSED ?? 0),
      },
      rates: {
        confirmation:
          confirmationDecisions > 0
            ? (confirmationMap.CONFIRMED ?? 0) / confirmationDecisions
            : null,
        delivery: deliveryDecisions > 0 ? deliveredOrders / deliveryDecisions : null,
      },
      finance: {
        grossMargin,
        estimatedCogs: Number(costSummary._sum.totalCost ?? 0),
        costedRevenue: Number(costSummary._sum.revenue ?? 0),
        operatingExpenses: Number(expenses._sum.amount ?? 0),
        estimatedNetContribution: grossMargin - Number(expenses._sum.amount ?? 0),
        costedOrders: costSummary._count._all,
        ordersMissingCost,
        productsMissingCost,
        negativeMarginOrders,
      },
      dataQuality: {
        unmatchedShopifyItems,
        productsMissingCost,
        ordersMissingCost,
      },
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

function dashboardPeriod(query: { range?: string; dateFrom?: string; dateTo?: string }) {
  const now = new Date();
  const end = query.dateTo ? endOfDay(new Date(query.dateTo)) : now;
  let start: Date;
  let key = query.range ?? '30d';

  if (query.dateFrom && query.dateTo) {
    start = startOfDay(new Date(query.dateFrom));
    key = 'custom';
  } else if (query.range === 'today') {
    start = startOfDay(now);
  } else if (query.range === '7d') {
    start = new Date(end.getTime() - 7 * 86400000);
  } else {
    start = new Date(end.getTime() - 30 * 86400000);
    key = '30d';
  }

  const duration = Math.max(end.getTime() - start.getTime(), 86400000);
  return {
    key,
    current: { gte: start, lte: end },
    previous: {
      gte: new Date(start.getTime() - duration),
      lte: new Date(start.getTime() - 1),
    },
  };
}

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(23, 59, 59, 999);
  return result;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
