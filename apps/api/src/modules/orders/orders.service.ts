import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeCurrencyCode, PlatformCurrencySchema } from '@shopy/shared';
import { DeliveryStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { CreateOrderDto } from './dto/create-order.dto';

interface ListOrdersQuery {
  search?: string;
  status?: OrderStatus | 'all';
  source?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private orderWhere(organizationId: string, query: ListOrdersQuery): Prisma.OrderWhereInput {
    const status = query.status && query.status !== 'all' ? query.status : undefined;
    const search = query.search?.trim();
    const source = query.source?.trim();
    const city = query.city?.trim();
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.dateFrom) createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) createdAt.lte = new Date(query.dateTo);

    return {
      organizationId,
      ...(status ? { status } : {}),
      ...(source && source !== 'all' ? { source } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(city ? { customer: { city: { contains: city } } } : {}),
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
    };
  }

  async list(organizationId: string, query: ListOrdersQuery) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 25), 1), 100);
    const where = this.orderWhere(organizationId, query);

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          customer: true,
          items: true,
          costSnapshot: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  async summary(organizationId: string, query: ListOrdersQuery) {
    const where = this.orderWhere(organizationId, query);
    const [totalOrders, revenue, statusCounts, sourceCounts, missingCostCount, confirmationCounts] =
      await Promise.all([
        this.prisma.order.count({ where }),
        this.prisma.order.aggregate({ where, _sum: { totalAmount: true } }),
        this.prisma.order.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ['source'],
          where,
          _count: { _all: true },
        }),
        this.prisma.order.count({
          where: {
            ...where,
            costSnapshot: null,
          },
        }),
        this.prisma.confirmationTask.groupBy({
          by: ['status'],
          where: { order: where },
          _count: { _all: true },
        }),
      ]);

    const byStatus = statusCounts.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});
    const bySource = sourceCounts.reduce<Record<string, number>>((acc, item) => {
      acc[item.source] = item._count._all;
      return acc;
    }, {});
    const confirmationByStatus = confirmationCounts.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    return {
      totalOrders,
      totalRevenue: Number(revenue._sum.totalAmount ?? 0),
      statusCounts: byStatus,
      sourceCounts: bySource,
      shopifyOrderCount: bySource.shopify ?? 0,
      missingCostCount,
      confirmationCounts: {
        confirmed: confirmationByStatus.CONFIRMED ?? 0,
        unreachable: confirmationByStatus.UNREACHABLE ?? 0,
        cancelled: byStatus.CANCELLED ?? 0,
      },
    };
  }

  async getById(organizationId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, organizationId },
      include: {
        customer: true,
        items: { include: { product: true } },
        events: { orderBy: { createdAt: 'desc' } },
        confirmationTask: true,
        fulfillmentTask: true,
        parcel: { include: { events: { orderBy: { timestamp: 'desc' } } } },
        costSnapshot: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    const [externalEvents, automationRuns] = await Promise.all([
      order.externalId
        ? this.prisma.externalEvent.findMany({
            where: {
              organizationId,
              provider: 'SHOPIFY',
              OR: [
                { externalId: order.externalId },
                { externalId: { contains: order.externalId } },
              ],
            },
            orderBy: { receivedAt: 'desc' },
            take: 10,
          })
        : [],
      this.prisma.automationRun.findMany({
        where: {
          organizationId,
          OR: [
            { inputSnapshot: { path: ['orderId'], equals: order.id } },
            { outputSnapshot: { path: ['orderId'], equals: order.id } },
          ],
        },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
    ]);

    const timeline = [
      ...order.events.map((event) => ({
        id: `order-${event.id}`,
        source: 'Order',
        type: event.type,
        title: event.note ?? event.type.replace(/_/g, ' '),
        timestamp: event.createdAt,
      })),
      ...(order.parcel?.events ?? []).map((event) => ({
        id: `parcel-${event.id}`,
        source: 'Delivery',
        type: 'parcel_event',
        title: event.note ?? event.status.replace(/_/g, ' '),
        timestamp: event.timestamp,
      })),
      ...externalEvents.map((event) => ({
        id: `external-${event.id}`,
        source: 'Shopify',
        type: event.eventType,
        title: `Webhook ${event.eventType}`,
        timestamp: event.receivedAt,
      })),
      ...automationRuns.map((run) => ({
        id: `automation-${run.id}`,
        source: 'Automation',
        type: 'automation_run',
        title: `Automation run ${run.status.toLowerCase()}`,
        timestamp: run.startedAt,
      })),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return { ...order, externalEvents, automationRuns, timeline };
  }

  async addNote(organizationId: string, userId: string, id: string, note: string) {
    const cleanNote = note.trim();
    if (!cleanNote) throw new BadRequestException('Note is required');

    const order = await this.prisma.order.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    await this.prisma.orderEvent.create({
      data: {
        orderId: id,
        type: 'internal_note',
        userId,
        note: cleanNote.slice(0, 1000),
      },
    });

    return this.getById(organizationId, id);
  }

  async create(organizationId: string, userId: string, dto: CreateOrderDto) {
    const shippingCost = dto.shippingCost ?? 0;
    const items = dto.items.map((item) => {
      const total = item.quantity * item.unitPrice;
      return { ...item, total };
    });
    const totalAmount = items.reduce((sum, item) => sum + item.total, shippingCost);
    const sequence = await this.prisma.order.count({ where: { organizationId } });
    const orderNumber = `#${String(sequence + 1001).padStart(4, '0')}`;

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: {
          organizationId_phone: {
            organizationId,
            phone: dto.customerPhone,
          },
        },
        update: {
          name: dto.customerName,
          city: dto.city,
          address: dto.address,
        },
        create: {
          organizationId,
          name: dto.customerName,
          phone: dto.customerPhone,
          city: dto.city,
          address: dto.address,
        },
      });

      return tx.order.create({
        data: {
          organizationId,
          orderNumber,
          source: 'manual',
          customerId: customer.id,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          status: OrderStatus.PENDING,
          totalAmount,
          shippingCost,
          shippingAddress: {
            line1: dto.address ?? dto.city ?? '',
            city: dto.city ?? '',
            country: 'MA',
          },
          notes: dto.notes,
          tags: [],
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              name: item.name,
              sku: item.sku,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
          },
          events: {
            create: {
              type: 'created',
              userId,
              note: 'Manual order created',
              data: { status: OrderStatus.PENDING },
            },
          },
          confirmationTask: {
            create: {
              status: 'PENDING',
            },
          },
        },
        include: {
          customer: true,
          items: true,
          confirmationTask: true,
          events: true,
        },
      });
    });
  }

  async importCsv(organizationId: string, userId: string, csv: string) {
    const rows = parseCsv(csv);
    const [header, ...records] = rows;
    if (!header || records.length === 0) return { created: 0, orders: [] };
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    const workspaceCurrency = normalizeCurrencyCode(organization?.baseCurrency);

    const indexes = header.reduce<Record<string, number>>((acc, column, index) => {
      acc[column.trim().toLowerCase()] = index;
      return acc;
    }, {});

    const orders = [];
    for (const row of records) {
      const get = (name: string) => {
        const index = indexes[name];
        return typeof index === 'number' ? (row[index]?.trim() ?? '') : '';
      };
      const productName = get('product') || get('productname') || get('sku') || 'Imported product';
      const quantity = Number(get('quantity') || 1);
      const unitPrice = Number(get('price') || get('unitprice') || 0);
      const rowCurrency = get('currency');

      if (rowCurrency && !PlatformCurrencySchema.safeParse(rowCurrency.toUpperCase()).success) {
        throw new BadRequestException(`CSV currency ${rowCurrency.toUpperCase()} is not supported`);
      }

      if (rowCurrency && rowCurrency.toUpperCase() !== workspaceCurrency) {
        throw new BadRequestException(
          `CSV currency ${rowCurrency.toUpperCase()} does not match workspace currency ${workspaceCurrency}`,
        );
      }

      if (!get('customer') && !get('customername')) continue;
      if (!get('phone') && !get('customerphone')) continue;

      const order = await this.create(organizationId, userId, {
        customerName: get('customer') || get('customername'),
        customerPhone: get('phone') || get('customerphone'),
        city: get('city'),
        address: get('address'),
        items: [
          {
            name: productName,
            sku: get('sku') || undefined,
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
            unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
          },
        ],
      });
      orders.push(order);
    }

    return { created: orders.length, orders };
  }

  async updateStatus(organizationId: string, userId: string, id: string, status: OrderStatus) {
    const order = await this.prisma.order.findFirst({
      where: { id, organizationId },
      include: { confirmationTask: true, fulfillmentTask: true, parcel: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status,
          events: {
            create: {
              type: 'status_change',
              userId,
              note: `Status changed from ${order.status} to ${status}`,
              data: { from: order.status, to: status },
            },
          },
        },
        include: {
          customer: true,
          items: true,
          confirmationTask: true,
          fulfillmentTask: true,
          parcel: true,
        },
      });

      if (status === OrderStatus.CONFIRMED) {
        await tx.confirmationTask.upsert({
          where: { orderId: id },
          update: { status: 'CONFIRMED' },
          create: { orderId: id, status: 'CONFIRMED' },
        });
        await tx.fulfillmentTask.upsert({
          where: { orderId: id },
          update: { status: 'TO_PACK' },
          create: { orderId: id, status: 'TO_PACK' },
        });
      }

      if (status === OrderStatus.REFUSED || status === OrderStatus.CANCELLED) {
        await tx.confirmationTask.upsert({
          where: { orderId: id },
          update: { status: status === OrderStatus.REFUSED ? 'REFUSED' : 'UNREACHABLE' },
          create: {
            orderId: id,
            status: status === OrderStatus.REFUSED ? 'REFUSED' : 'UNREACHABLE',
          },
        });
      }

      if (
        status === OrderStatus.SHIPPED ||
        status === OrderStatus.DELIVERED ||
        status === OrderStatus.RETURNED
      ) {
        const parcelStatus =
          status === OrderStatus.DELIVERED
            ? DeliveryStatus.DELIVERED
            : status === OrderStatus.RETURNED
              ? DeliveryStatus.RETURNED
              : DeliveryStatus.IN_TRANSIT;

        const parcel = await tx.parcel.upsert({
          where: { orderId: id },
          update: { status: parcelStatus, codAmount: order.totalAmount },
          create: {
            orderId: id,
            status: parcelStatus,
            codAmount: order.totalAmount,
            trackingNumber: `OPS-${id.slice(-8).toUpperCase()}`,
          },
        });

        await tx.parcelEvent.create({
          data: {
            parcelId: parcel.id,
            status: parcelStatus,
            note: `Order marked ${status.toLowerCase()}`,
          },
        });
      }

      return updated;
    });
  }
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      field = '';
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}
