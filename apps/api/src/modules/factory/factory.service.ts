import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class FactoryService {
  constructor(private readonly prisma: PrismaService) {}

  listFactories(organizationId: string) {
    return this.prisma.factory.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
  }

  createFactory(organizationId: string, body: Record<string, unknown>) {
    return this.prisma.factory.create({
      data: {
        organizationId,
        name: text(body.name, 'Factory'),
        contactName: optionalText(body.contactName),
        phone: optionalText(body.phone),
        address: optionalText(body.address),
        notes: optionalText(body.notes),
      },
    });
  }

  updateFactory(organizationId: string, id: string, body: Record<string, unknown>) {
    return this.prisma.factory.update({
      where: { id, organizationId },
      data: {
        ...(body.name ? { name: text(body.name, 'Factory') } : {}),
        ...(body.contactName !== undefined ? { contactName: optionalText(body.contactName) } : {}),
        ...(body.phone !== undefined ? { phone: optionalText(body.phone) } : {}),
        ...(body.address !== undefined ? { address: optionalText(body.address) } : {}),
        ...(body.notes !== undefined ? { notes: optionalText(body.notes) } : {}),
        ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
      },
    });
  }

  listCostComponents(organizationId: string) {
    return this.prisma.costComponent.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  createCostComponent(organizationId: string, body: Record<string, unknown>) {
    return this.prisma.costComponent.create({
      data: {
        organizationId,
        name: text(body.name, 'Component'),
        category: text(body.category, 'general'),
        defaultUnitCost: money(body.defaultUnitCost),
        currency: text(body.currency, 'USD'),
      },
    });
  }

  updateCostComponent(organizationId: string, id: string, body: Record<string, unknown>) {
    return this.prisma.costComponent.update({
      where: { id, organizationId },
      data: {
        ...(body.name ? { name: text(body.name, 'Component') } : {}),
        ...(body.category ? { category: text(body.category, 'general') } : {}),
        ...(body.defaultUnitCost !== undefined
          ? { defaultUnitCost: money(body.defaultUnitCost) }
          : {}),
        ...(body.currency ? { currency: text(body.currency, 'USD') } : {}),
        ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
      },
    });
  }

  listProductCosts(organizationId: string) {
    return this.prisma.productCost.findMany({
      where: { organizationId },
      include: { product: true, factory: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  listMissingCostProducts(organizationId: string, query: Record<string, unknown>) {
    const search = optionalText(query.search);
    const source = optionalText(query.source);
    return this.prisma.product.findMany({
      where: {
        organizationId,
        isActive: true,
        productCosts: { none: { active: true } },
        ...(source === 'shopify' ? { externalId: { startsWith: 'shopify-product-' } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { sku: { contains: search } },
                { externalId: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        _count: {
          select: {
            orderItems: true,
          },
        },
      },
      orderBy: [{ orderItems: { _count: 'desc' } }, { updatedAt: 'desc' }, { name: 'asc' }],
      take: 100,
    });
  }

  async upsertProductCost(organizationId: string, body: Record<string, unknown>) {
    const productId = text(body.productId, '');
    if (!productId) throw new BadRequestException('productId is required');
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.productCost.create({
      data: productCostCreateData(organizationId, body),
      include: { product: true, factory: true },
    });
  }

  async bulkCompleteProductCosts(organizationId: string, body: Record<string, unknown>) {
    const productIds = Array.isArray(body.productIds) ? body.productIds.map(String) : [];
    if (!productIds.length) throw new BadRequestException('Select at least one product');

    const products = await this.prisma.product.findMany({
      where: { organizationId, id: { in: productIds } },
      select: { id: true, sku: true },
    });
    if (!products.length) throw new NotFoundException('No products found');

    const firstProduct = products[0];
    if (!firstProduct) throw new NotFoundException('No products found');

    const costs = productCostCreateData(organizationId, {
      ...body,
      productId: firstProduct.id,
    });
    const created = [];
    for (const product of products) {
      const cost = await this.prisma.productCost.create({
        data: {
          ...costs,
          productId: product.id,
        },
      });
      created.push(cost);
    }

    const productIdSet = products.map((product) => product.id);
    const skus = products.map((product) => product.sku).filter(Boolean) as string[];
    const affectedOrders = await this.prisma.order.findMany({
      where: {
        organizationId,
        items: {
          some: {
            OR: [
              { productId: { in: productIdSet } },
              ...(skus.length ? [{ sku: { in: skus } }] : []),
            ],
          },
        },
      },
      select: { id: true },
    });
    for (const order of affectedOrders) await this.recalculateOrder(organizationId, order.id);

    const firstCreatedCost = created[0];
    return {
      created: created.length,
      affectedOrders: affectedOrders.length,
      totalUnitCost: firstCreatedCost ? Number(firstCreatedCost.totalUnitCost) : 0,
    };
  }

  updateProductCost(organizationId: string, id: string, body: Record<string, unknown>) {
    const data = productCostUpdateData(body);
    return this.prisma.productCost.update({
      where: { id, organizationId },
      data,
      include: { product: true, factory: true },
    });
  }

  listExpenses(organizationId: string) {
    return this.prisma.operatingExpense.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  createExpense(organizationId: string, body: Record<string, unknown>) {
    return this.prisma.operatingExpense.create({
      data: {
        organizationId,
        name: text(body.name, 'Expense'),
        category: text(body.category, 'general'),
        amount: money(body.amount),
        currency: text(body.currency, 'USD'),
        recurrence: text(body.recurrence, 'ONE_TIME'),
        appliesToProductId: optionalText(body.appliesToProductId),
        notes: optionalText(body.notes),
      },
    });
  }

  updateExpense(organizationId: string, id: string, body: Record<string, unknown>) {
    return this.prisma.operatingExpense.update({
      where: { id, organizationId },
      data: {
        ...(body.name ? { name: text(body.name, 'Expense') } : {}),
        ...(body.category ? { category: text(body.category, 'general') } : {}),
        ...(body.amount !== undefined ? { amount: money(body.amount) } : {}),
        ...(body.currency ? { currency: text(body.currency, 'USD') } : {}),
        ...(body.recurrence ? { recurrence: text(body.recurrence, 'ONE_TIME') } : {}),
        ...(body.notes !== undefined ? { notes: optionalText(body.notes) } : {}),
        ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
      },
    });
  }

  async summary(organizationId: string, query: { dateFrom?: string; dateTo?: string } = {}) {
    const staleBefore = new Date(Date.now() - 90 * 86400000);
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.dateFrom) createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) createdAt.lte = new Date(query.dateTo);
    const periodOrderFilter: Prisma.OrderWhereInput = {
      source: { not: 'smoke' },
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
    };
    const [
      snapshotAggregate,
      snapshots,
      expenseAggregate,
      productsMissingCost,
      totalProducts,
      ordersMissingCost,
      unmatchedShopifyItems,
      negativeMarginOrders,
      staleCostRecords,
      orderItems,
    ] = await Promise.all([
      this.prisma.orderCostSnapshot.aggregate({
        where: { organizationId, order: periodOrderFilter },
        _sum: { revenue: true, totalCost: true, grossMargin: true },
        _count: { _all: true },
      }),
      this.prisma.orderCostSnapshot.findMany({
        where: { organizationId, order: periodOrderFilter },
        include: {
          order: { select: { orderNumber: true, source: true, status: true, createdAt: true } },
        },
        orderBy: { calculatedAt: 'desc' },
        take: 250,
      }),
      this.prisma.operatingExpense.aggregate({
        where: {
          organizationId,
          active: true,
          ...(Object.keys(createdAt).length ? { createdAt } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.product.count({
        where: { organizationId, isActive: true, productCosts: { none: { active: true } } },
      }),
      this.prisma.product.count({ where: { organizationId, isActive: true } }),
      this.prisma.order.count({
        where: { organizationId, ...periodOrderFilter, costSnapshot: null },
      }),
      this.prisma.orderItem.count({
        where: {
          order: { organizationId, source: 'shopify', ...periodOrderFilter },
          productId: null,
        },
      }),
      this.prisma.orderCostSnapshot.count({
        where: { organizationId, order: periodOrderFilter, grossMargin: { lt: 0 } },
      }),
      this.prisma.productCost.count({
        where: { organizationId, active: true, effectiveFrom: { lt: staleBefore } },
      }),
      this.prisma.orderItem.findMany({
        where: { order: { organizationId, ...periodOrderFilter }, productId: { not: null } },
        select: {
          productId: true,
          quantity: true,
          total: true,
          product: {
            select: {
              name: true,
              sku: true,
              productCosts: {
                where: { active: true },
                orderBy: { effectiveFrom: 'desc' },
                take: 1,
                select: { totalUnitCost: true },
              },
            },
          },
        },
        take: 5000,
      }),
    ]);
    const revenue = Number(snapshotAggregate._sum.revenue ?? 0);
    const totalCost = Number(snapshotAggregate._sum.totalCost ?? 0);
    const grossMargin = Number(snapshotAggregate._sum.grossMargin ?? 0);
    const expenses = Number(expenseAggregate._sum.amount ?? 0);
    const sourceProfitability = new Map<
      string,
      { revenue: number; cost: number; margin: number }
    >();
    for (const snapshot of snapshots) {
      const source = snapshot.order.source;
      const entry = sourceProfitability.get(source) ?? { revenue: 0, cost: 0, margin: 0 };
      entry.revenue += Number(snapshot.revenue);
      entry.cost += Number(snapshot.totalCost);
      entry.margin += Number(snapshot.grossMargin);
      sourceProfitability.set(source, entry);
    }
    const productProfitability = new Map<
      string,
      { productId: string; name: string; sku: string | null; revenue: number; cost: number }
    >();
    for (const item of orderItems) {
      const productId = item.productId;
      const unitCost = item.product?.productCosts[0]?.totalUnitCost;
      if (!productId || unitCost === undefined) continue;
      const entry = productProfitability.get(productId) ?? {
        productId,
        name: item.product?.name ?? 'Product',
        sku: item.product?.sku ?? null,
        revenue: 0,
        cost: 0,
      };
      entry.revenue += Number(item.total);
      entry.cost += Number(unitCost) * item.quantity;
      productProfitability.set(productId, entry);
    }
    const productRows = Array.from(productProfitability.values())
      .map((item) => ({ ...item, margin: item.revenue - item.cost }))
      .sort((a, b) => b.margin - a.margin);
    return {
      revenue,
      estimatedCogs: totalCost,
      grossMargin,
      grossMarginPercent: revenue > 0 ? grossMargin / revenue : 0,
      expenses,
      estimatedNetContribution: grossMargin - expenses,
      snapshots: snapshotAggregate._count._all,
      productsMissingCost,
      totalProducts,
      costedProducts: Math.max(totalProducts - productsMissingCost, 0),
      ordersMissingCost,
      unmatchedShopifyItems,
      negativeMarginOrders,
      staleCostRecords,
      sourceProfitability: Array.from(sourceProfitability.entries()).map(([source, values]) => ({
        source,
        ...values,
      })),
      mostProfitableProducts: productRows.slice(0, 5),
      leastProfitableProducts: [...productRows].reverse().slice(0, 5),
      recentOrderProfitability: snapshots.slice(0, 25).map((snapshot) => ({
        orderId: snapshot.orderId,
        orderNumber: snapshot.order.orderNumber,
        source: snapshot.order.source,
        status: snapshot.order.status,
        revenue: Number(snapshot.revenue),
        cost: Number(snapshot.totalCost),
        margin: Number(snapshot.grossMargin),
        marginPercent: Number(snapshot.grossMarginPercent),
        calculatedAt: snapshot.calculatedAt,
      })),
    };
  }

  async recalculateOrder(organizationId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const [organization, costs] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { baseCurrency: true },
      }),
      this.prisma.productCost.findMany({
        where: {
          organizationId,
          active: true,
          OR: [
            {
              productId: {
                in: order.items.map((item) => item.productId).filter(Boolean) as string[],
              },
            },
            {
              product: {
                sku: { in: order.items.map((item) => item.sku).filter(Boolean) as string[] },
              },
            },
          ],
        },
        include: { product: true },
      }),
    ]);
    const costByProduct = new Map(
      costs.map((cost) => [cost.productId, Number(cost.totalUnitCost)]),
    );
    const costBySku = new Map(
      costs
        .filter((cost) => cost.product?.sku)
        .map((cost) => [cost.product.sku as string, Number(cost.totalUnitCost)]),
    );
    const productCostTotal = order.items.reduce(
      (total, item) =>
        total +
        Number(item.quantity) *
          (item.productId
            ? (costByProduct.get(item.productId) ?? costBySku.get(item.sku ?? '') ?? 0)
            : (costBySku.get(item.sku ?? '') ?? 0)),
      0,
    );
    const revenue = Number(order.totalAmount);
    const grossMargin = revenue - productCostTotal;
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.orderCostSnapshot.upsert({
        where: { orderId: order.id },
        update: {
          productCostTotal,
          totalCost: productCostTotal,
          revenue,
          grossMargin,
          grossMarginPercent: revenue > 0 ? grossMargin / revenue : 0,
          calculatedAt: new Date(),
        },
        create: {
          organizationId,
          orderId: order.id,
          productCostTotal,
          totalCost: productCostTotal,
          revenue,
          grossMargin,
          grossMarginPercent: revenue > 0 ? grossMargin / revenue : 0,
          currency: organization?.baseCurrency ?? 'USD',
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'cost_recalculated',
          note: 'Order cost and margin recalculated',
          data: { totalCost: productCostTotal, revenue, grossMargin },
        },
      });
      return snapshot;
    });
  }

  async recalculateAll(organizationId: string) {
    const orders = await this.prisma.order.findMany({
      where: { organizationId },
      select: { id: true },
    });
    for (const order of orders) await this.recalculateOrder(organizationId, order.id);
    return { recalculated: orders.length };
  }
}

function text(value: unknown, fallback: string) {
  return String(value ?? fallback).trim() || fallback;
}

function optionalText(value: unknown) {
  const result = String(value ?? '').trim();
  return result || null;
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? new Prisma.Decimal(parsed) : new Prisma.Decimal(0);
}

function productCostValues(body: Record<string, unknown>) {
  const values = {
    sewingCost: money(body.sewingCost),
    fabricCost: money(body.fabricCost),
    accessoryCost: money(body.accessoryCost),
    packagingCost: money(body.packagingCost),
    otherVariableCost: money(body.otherVariableCost),
    overheadAllocation: money(body.overheadAllocation),
  };
  const totalUnitCost = Object.values(values).reduce(
    (total, value) => total.add(value),
    new Prisma.Decimal(0),
  );
  return { values, totalUnitCost };
}

function productCostCreateData(
  organizationId: string,
  body: Record<string, unknown>,
): Prisma.ProductCostUncheckedCreateInput {
  const { values, totalUnitCost } = productCostValues(body);
  return {
    organizationId,
    productId: text(body.productId, ''),
    ...(body.factoryId ? { factoryId: text(body.factoryId, '') } : {}),
    ...values,
    totalUnitCost,
    currency: text(body.currency, 'USD'),
    ...(body.notes !== undefined ? { notes: optionalText(body.notes) } : {}),
    ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
  };
}

function productCostUpdateData(
  body: Record<string, unknown>,
): Prisma.ProductCostUncheckedUpdateInput {
  const { values, totalUnitCost } = productCostValues(body);
  return {
    ...(body.factoryId ? { factoryId: text(body.factoryId, '') } : {}),
    ...values,
    totalUnitCost,
    currency: text(body.currency, 'USD'),
    ...(body.notes !== undefined ? { notes: optionalText(body.notes) } : {}),
    ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
  };
}
