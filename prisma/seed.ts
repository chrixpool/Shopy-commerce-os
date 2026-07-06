import {
  AutomationRunStatus,
  DraftActionStatus,
  IntegrationMode,
  IntegrationProvider,
  IntegrationStatus,
  OrderStatus,
  PrismaClient,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const customers = [
  { name: 'Amal Benali', phone: '+212600000001', city: 'Casablanca', address: '12 Rue Atlas' },
  { name: 'Youssef Idrissi', phone: '+212600000002', city: 'Rabat', address: '8 Avenue Hassan II' },
  { name: 'Nora El Fassi', phone: '+212600000003', city: 'Marrakech', address: '22 Medina Road' },
  { name: 'Karim Alaoui', phone: '+212600000004', city: 'Tangier', address: '5 Port Street' },
];

const products = [
  {
    externalId: 'seed-product-1',
    name: 'Wireless Earbuds',
    sku: 'EAR-100',
    price: 349,
    cost: 180,
    stock: 45,
  },
  {
    externalId: 'seed-product-2',
    name: 'Smart Watch',
    sku: 'WAT-200',
    price: 799,
    cost: 420,
    stock: 28,
  },
  {
    externalId: 'seed-product-3',
    name: 'Phone Case',
    sku: 'CAS-300',
    price: 129,
    cost: 45,
    stock: 3,
  },
  {
    externalId: 'seed-product-4',
    name: 'USB-C Charger',
    sku: 'CHG-400',
    price: 199,
    cost: 85,
    stock: 75,
  },
  {
    externalId: 'seed-product-5',
    name: 'Portable Speaker',
    sku: 'SPK-500',
    price: 499,
    cost: 260,
    stock: 32,
  },
];

const orders = [
  {
    externalId: 'seed-order-1001',
    orderNumber: '#1001',
    customerPhone: '+212600000001',
    status: OrderStatus.PENDING,
    productSku: 'EAR-100',
    quantity: 1,
  },
  {
    externalId: 'seed-order-1002',
    orderNumber: '#1002',
    customerPhone: '+212600000002',
    status: OrderStatus.CONFIRMED,
    productSku: 'WAT-200',
    quantity: 1,
  },
  {
    externalId: 'seed-order-1003',
    orderNumber: '#1003',
    customerPhone: '+212600000003',
    status: OrderStatus.SHIPPED,
    productSku: 'CAS-300',
    quantity: 2,
  },
  {
    externalId: 'seed-order-1004',
    orderNumber: '#1004',
    customerPhone: '+212600000004',
    status: OrderStatus.DELIVERED,
    productSku: 'SPK-500',
    quantity: 1,
  },
  {
    externalId: 'seed-order-1005',
    orderNumber: '#1005',
    customerPhone: '+212600000001',
    status: OrderStatus.RETURNED,
    productSku: 'CHG-400',
    quantity: 1,
  },
  {
    externalId: 'seed-order-1006',
    orderNumber: '#1006',
    customerPhone: '+212600000002',
    status: OrderStatus.CANCELLED,
    productSku: 'CAS-300',
    quantity: 3,
  },
  {
    externalId: 'seed-order-1007',
    orderNumber: '#1007',
    customerPhone: '+212600000003',
    status: OrderStatus.REFUSED,
    productSku: 'EAR-100',
    quantity: 1,
  },
  {
    externalId: 'seed-order-1008',
    orderNumber: '#1008',
    customerPhone: '+212600000004',
    status: OrderStatus.PENDING,
    productSku: 'WAT-200',
    quantity: 1,
  },
];

function confirmationStatus(status: OrderStatus) {
  if (
    status === OrderStatus.CONFIRMED ||
    status === OrderStatus.SHIPPED ||
    status === OrderStatus.DELIVERED
  )
    return 'CONFIRMED';
  if (status === OrderStatus.REFUSED) return 'REFUSED';
  if (status === OrderStatus.CANCELLED) return 'UNREACHABLE';
  return 'PENDING';
}

function deliveryStatus(status: OrderStatus) {
  if (status === OrderStatus.DELIVERED) return 'DELIVERED';
  if (status === OrderStatus.RETURNED) return 'RETURNED';
  return 'IN_TRANSIT';
}

async function main() {
  console.log('Seeding database...');

  const org = await prisma.organization.upsert({
    where: { slug: 'shopy-demo' },
    update: { name: 'Shopy Demo', baseCurrency: 'USD' },
    create: {
      name: 'Shopy Demo',
      slug: 'shopy-demo',
      baseCurrency: 'USD',
    },
  });

  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'Oussemawarteni@shopy.com';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'ChangeMe.0011**';
  const passwordHash = await bcrypt.hash(ownerPassword, 10);
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      name: 'Oussema Warteni',
      passwordHash,
      role: 'OWNER',
      organizationId: org.id,
    },
    create: {
      name: 'Oussema Warteni',
      email: ownerEmail,
      passwordHash,
      role: 'OWNER',
      organizationId: org.id,
    },
  });

  await prisma.user.deleteMany({
    where: {
      email: { in: ['demo@Shopy.app', 'demo@shopy.app'] },
    },
  });

  await prisma.integration.deleteMany({
    where: { organizationId: org.id, provider: { in: ['shopify'] } },
  });

  const seededIntegrations = [
    {
      provider: IntegrationProvider.SHOPIFY,
      label: 'Shopify',
      status: IntegrationStatus.DISCONNECTED,
      mode: IntegrationMode.READ_ONLY,
      isActive: false,
    },
    {
      provider: IntegrationProvider.META_ADS,
      label: 'Meta Ads',
      status: IntegrationStatus.DISCONNECTED,
      mode: IntegrationMode.READ_ONLY,
      isActive: false,
    },
    {
      provider: IntegrationProvider.FACEBOOK_PAGE,
      label: 'Facebook Page',
      status: IntegrationStatus.DISCONNECTED,
      mode: IntegrationMode.DRAFT_ACTIONS,
      isActive: false,
    },
    {
      provider: IntegrationProvider.INSTAGRAM,
      label: 'Instagram',
      status: IntegrationStatus.DISCONNECTED,
      mode: IntegrationMode.DRAFT_ACTIONS,
      isActive: false,
    },
    {
      provider: IntegrationProvider.CSV,
      label: 'CSV import',
      status: IntegrationStatus.CONNECTED,
      mode: IntegrationMode.READ_ONLY,
      isActive: true,
    },
    {
      provider: IntegrationProvider.MANUAL,
      label: 'Manual workflows',
      status: IntegrationStatus.CONNECTED,
      mode: IntegrationMode.APPROVAL_REQUIRED,
      isActive: true,
    },
  ];

  for (const integration of seededIntegrations) {
    await prisma.integration.upsert({
      where: {
        organizationId_provider: { organizationId: org.id, provider: integration.provider },
      },
      update: {
        isActive: integration.isActive,
        status: integration.status,
        mode: integration.mode,
        credentials: {},
        encryptedCredentials: {},
        config: { label: integration.label, seeded: true },
        errorMessage: null,
      },
      create: {
        organizationId: org.id,
        provider: integration.provider,
        isActive: integration.isActive,
        status: integration.status,
        mode: integration.mode,
        credentials: {},
        encryptedCredentials: {},
        config: { label: integration.label, seeded: true },
      },
    });
  }

  const existingStarterAutomation = await prisma.automation.findFirst({
    where: { organizationId: org.id, name: 'Flag delayed confirmations' },
    select: { id: true },
  });
  const starterAutomation = existingStarterAutomation
    ? await prisma.automation.update({
        where: { id: existingStarterAutomation.id },
        data: {
          enabled: true,
          provider: IntegrationProvider.MANUAL,
          triggerType: 'confirmation_delayed',
          actionType: 'create_smart_suggestion',
          dryRun: true,
          approvalRequired: true,
          conditions: { olderThanHours: 24 },
          actionConfig: { priority: 'high' },
        },
      })
    : await prisma.automation.create({
        data: {
          organizationId: org.id,
          name: 'Flag delayed confirmations',
          trigger: { type: 'confirmation_delayed', conditions: { olderThanHours: 24 } },
          actions: [{ type: 'create_smart_suggestion', params: { priority: 'high' } }],
          enabled: true,
          provider: IntegrationProvider.MANUAL,
          triggerType: 'confirmation_delayed',
          actionType: 'create_smart_suggestion',
          dryRun: true,
          approvalRequired: true,
          conditions: { olderThanHours: 24 },
          actionConfig: { priority: 'high' },
        },
      });

  await prisma.automationRun.deleteMany({
    where: {
      automationId: starterAutomation.id,
      inputSnapshot: { path: ['seeded'], equals: true },
    },
  });
  await prisma.automationRun.create({
    data: {
      organizationId: org.id,
      automationId: starterAutomation.id,
      status: AutomationRunStatus.SUCCESS,
      dryRun: true,
      inputSnapshot: { seeded: true },
      outputSnapshot: { suggestion: 'Review delayed confirmation queue' },
      finishedAt: new Date(),
    },
  });

  const existingDraftAction = await prisma.draftAction.findFirst({
    where: {
      organizationId: org.id,
      provider: IntegrationProvider.META_ADS,
      actionType: 'recommend_campaign_review',
      title: 'Review high-spend campaigns',
    },
    select: { id: true },
  });
  const draftActionData = {
    status: DraftActionStatus.PENDING_APPROVAL,
    summary: 'Sample draft recommendation. Shopy will not edit budgets or launch campaigns.',
    payload: { seeded: true },
  };
  if (existingDraftAction) {
    await prisma.draftAction.update({
      where: { id: existingDraftAction.id },
      data: draftActionData,
    });
  } else {
    await prisma.draftAction.create({
      data: {
        organizationId: org.id,
        provider: IntegrationProvider.META_ADS,
        actionType: 'recommend_campaign_review',
        title: 'Review high-spend campaigns',
        createdBy: owner.id,
        ...draftActionData,
      },
    });
  }

  const inviteExpiresAt = new Date();
  inviteExpiresAt.setDate(inviteExpiresAt.getDate() + 7);
  const existingInvitation = await prisma.invitation.findFirst({
    where: {
      organizationId: org.id,
      email: 'operator@Shopy.app',
      status: 'PENDING',
    },
  });
  if (existingInvitation) {
    await prisma.invitation.update({
      where: { id: existingInvitation.id },
      data: {
        role: 'CONFIRMER',
        invitedById: owner.id,
        expiresAt: inviteExpiresAt,
      },
    });
  } else {
    await prisma.invitation.create({
      data: {
        organizationId: org.id,
        email: 'operator@Shopy.app',
        role: 'CONFIRMER',
        invitedById: owner.id,
        expiresAt: inviteExpiresAt,
      },
    });
  }

  const customerByPhone = new Map<string, Awaited<ReturnType<typeof prisma.customer.upsert>>>();
  for (const customer of customers) {
    const saved = await prisma.customer.upsert({
      where: { organizationId_phone: { organizationId: org.id, phone: customer.phone } },
      update: customer,
      create: { organizationId: org.id, ...customer },
    });
    customerByPhone.set(customer.phone, saved);
  }

  const productBySku = new Map<string, Awaited<ReturnType<typeof prisma.product.upsert>>>();
  for (const product of products) {
    const saved = await prisma.product.upsert({
      where: {
        organizationId_externalId: { organizationId: org.id, externalId: product.externalId },
      },
      update: product,
      create: { organizationId: org.id, ...product },
    });
    await prisma.inventoryRecord.deleteMany({
      where: { productId: saved.id, reason: 'Seed stock' },
    });
    await prisma.inventoryRecord.create({
      data: {
        productId: saved.id,
        type: 'IN',
        quantity: product.stock,
        reason: 'Seed stock',
      },
    });
    productBySku.set(product.sku, saved);
  }

  for (const seedOrder of orders) {
    const customer = customerByPhone.get(seedOrder.customerPhone);
    const product = productBySku.get(seedOrder.productSku);
    if (!customer || !product) continue;

    const total = Number(product.price) * seedOrder.quantity;
    const existing = await prisma.order.findUnique({
      where: {
        organizationId_externalId: { organizationId: org.id, externalId: seedOrder.externalId },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.parcelEvent.deleteMany({ where: { parcel: { orderId: existing.id } } });
      await prisma.parcel.deleteMany({ where: { orderId: existing.id } });
      await prisma.fulfillmentTask.deleteMany({ where: { orderId: existing.id } });
      await prisma.confirmationTask.deleteMany({ where: { orderId: existing.id } });
      await prisma.orderItem.deleteMany({ where: { orderId: existing.id } });
      await prisma.orderEvent.deleteMany({ where: { orderId: existing.id } });
    }

    const order = await prisma.order.upsert({
      where: {
        organizationId_externalId: { organizationId: org.id, externalId: seedOrder.externalId },
      },
      update: {
        orderNumber: seedOrder.orderNumber,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        status: seedOrder.status,
        totalAmount: total,
        shippingCost: 0,
        shippingAddress: { line1: customer.address, city: customer.city, country: 'MA' },
        notes: 'Seed demo order',
        tags: ['demo'],
      },
      create: {
        organizationId: org.id,
        externalId: seedOrder.externalId,
        orderNumber: seedOrder.orderNumber,
        source: 'manual',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        status: seedOrder.status,
        totalAmount: total,
        shippingCost: 0,
        shippingAddress: { line1: customer.address, city: customer.city, country: 'MA' },
        notes: 'Seed demo order',
        tags: ['demo'],
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        quantity: seedOrder.quantity,
        unitPrice: product.price,
        total,
      },
    });

    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'seeded',
        userId: owner.id,
        note: `Seeded as ${seedOrder.status}`,
        data: { status: seedOrder.status },
      },
    });

    await prisma.confirmationTask.create({
      data: {
        orderId: order.id,
        status: confirmationStatus(seedOrder.status),
      },
    });

    if (
      [OrderStatus.CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(seedOrder.status)
    ) {
      await prisma.fulfillmentTask.create({
        data: {
          orderId: order.id,
          status: seedOrder.status === OrderStatus.CONFIRMED ? 'TO_PACK' : 'PACKED',
          packedAt: seedOrder.status === OrderStatus.CONFIRMED ? null : new Date(),
        },
      });
    }

    if (
      [OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.RETURNED].includes(seedOrder.status)
    ) {
      const parcel = await prisma.parcel.create({
        data: {
          orderId: order.id,
          trackingNumber: `SHP-${seedOrder.orderNumber.replace('#', '')}`,
          status: deliveryStatus(seedOrder.status),
          codAmount: total,
          codCollected: seedOrder.status === OrderStatus.DELIVERED,
        },
      });

      await prisma.parcelEvent.create({
        data: {
          parcelId: parcel.id,
          status: deliveryStatus(seedOrder.status),
          location: customer.city,
          note: `Seed parcel ${seedOrder.status.toLowerCase()}`,
        },
      });
    }
  }

  console.log(`Organization: ${org.name} (${org.slug})`);
  console.log(`Owner: ${owner.email}`);
  console.log('Seeding complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
