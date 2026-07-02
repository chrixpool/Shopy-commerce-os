import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface ShopifyOrderPayload {
  id: string | number;
  name?: string;
  order_number?: string | number;
  cancelled_at?: string | null;
  total_price?: string;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
  shipping_address?: {
    phone?: string;
    city?: string;
    address1?: string;
    [key: string]: unknown;
  };
  customer?: {
    id?: string | number;
    first_name?: string;
    last_name?: string;
    phone?: string;
  };
  phone?: string;
  contact_email?: string;
  email?: string;
  note?: string;
  tags?: string;
}

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);

  constructor(private prisma: PrismaService) {}

  async syncOrders(organizationId: string) {
    this.logger.log(`Syncing Shopify orders for organization ${organizationId}`);
    // Scheduled full sync will be implemented here
  }

  async processWebhookOrder(
    organizationId: string,
    shopDomain: string,
    payload: ShopifyOrderPayload,
  ) {
    this.logger.log(
      `Processing Shopify webhook order ${payload.id} for organization ${organizationId}`,
    );

    const customerName = payload.customer
      ? `${payload.customer.first_name} ${payload.customer.last_name}`.trim()
      : 'Unknown';
    const customerPhone =
      payload.shipping_address?.phone || payload.customer?.phone || payload.phone || '0000000000';

    // Upsert customer
    const customer = await this.prisma.customer.upsert({
      where: {
        organizationId_phone: {
          organizationId,
          phone: customerPhone,
        },
      },
      update: {
        name: customerName,
      },
      create: {
        organizationId,
        externalId: payload.customer?.id?.toString(),
        name: customerName,
        phone: customerPhone,
        email: payload.contact_email || payload.email,
        city: payload.shipping_address?.city,
        address: payload.shipping_address?.address1,
      },
    });

    // Upsert Order
    const order = await this.prisma.order.upsert({
      where: {
        organizationId_externalId: {
          organizationId,
          externalId: payload.id.toString(),
        },
      },
      update: {
        status: payload.cancelled_at ? 'CANCELLED' : 'PENDING',
      },
      create: {
        organizationId,
        externalId: payload.id.toString(),
        orderNumber: payload.name || `#${payload.order_number}`,
        source: 'shopify',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        totalAmount: parseFloat(payload.total_price || '0'),
        shippingCost: parseFloat(payload.total_shipping_price_set?.shop_money?.amount || '0'),
        shippingAddress: (payload.shipping_address ?? {}) as Prisma.InputJsonValue,
        notes: payload.note,
        tags: payload.tags ? payload.tags.split(',').map((t: string) => t.trim()) : [],
      },
    });

    // Create confirmation task if new
    await this.prisma.confirmationTask.upsert({
      where: { orderId: order.id },
      update: {},
      create: {
        orderId: order.id,
        status: 'PENDING',
      },
    });

    return order;
  }
}
