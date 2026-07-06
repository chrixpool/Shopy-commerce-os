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

  async summary(organizationId: string) {
    const [snapshots, expenses, productsMissingCost] = await Promise.all([
      this.prisma.orderCostSnapshot.findMany({ where: { organizationId }, take: 250 }),
      this.prisma.operatingExpense.findMany({ where: { organizationId, active: true } }),
      this.prisma.product.count({
        where: { organizationId, productCosts: { none: { active: true } } },
      }),
    ]);
    const revenue = sum(snapshots.map((item) => item.revenue));
    const totalCost = sum(snapshots.map((item) => item.totalCost));
    const grossMargin = revenue - totalCost;
    return {
      revenue,
      estimatedCogs: totalCost,
      grossMargin,
      grossMarginPercent: revenue > 0 ? grossMargin / revenue : 0,
      expenses: sum(expenses.map((item) => item.amount)),
      snapshots: snapshots.length,
      productsMissingCost,
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
          productId: { in: order.items.map((item) => item.productId).filter(Boolean) as string[] },
        },
      }),
    ]);
    const costByProduct = new Map(
      costs.map((cost) => [cost.productId, Number(cost.totalUnitCost)]),
    );
    const productCostTotal = order.items.reduce(
      (total, item) =>
        total +
        Number(item.quantity) * (item.productId ? (costByProduct.get(item.productId) ?? 0) : 0),
      0,
    );
    const revenue = Number(order.totalAmount);
    const grossMargin = revenue - productCostTotal;
    return this.prisma.orderCostSnapshot.upsert({
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

function sum(values: Array<Prisma.Decimal | number>): number {
  let total = 0;
  for (const value of values) total += Number(value);
  return total;
}
