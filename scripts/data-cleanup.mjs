/* global process, console */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

for (const file of ['.env']) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) continue;
  for (const line of fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const prisma = new PrismaClient();
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || 'true'];
  }),
);

const execute = args.get('execute') === 'true';
const organizationSlug =
  args.get('org') || args.get('organization') || process.env.DATA_CLEANUP_ORG;
const deleteSources = String(process.env.DELETE_SOURCES || 'SEED,DEMO,TEST,SMOKE')
  .split(',')
  .map((source) => source.trim().toUpperCase())
  .filter(Boolean);

const seedPhones = ['+212600000001', '+212600000002', '+212600000003', '+212600000004'];
const seedOrderNumbers = ['#1001', '#1002', '#1003', '#1004', '#1005', '#1006', '#1007', '#1008'];
const seedSkus = ['EAR-100', 'WAT-200', 'CAS-300', 'CHG-400', 'SPK-500'];

if (!organizationSlug) {
  console.error('Missing required organization slug. Use --org=<slug>.');
  process.exit(1);
}

function zeroCounts() {
  return {
    OrderCostSnapshot: 0,
    ParcelEvent: 0,
    Parcel: 0,
    FulfillmentTask: 0,
    ConfirmationTask: 0,
    OrderEvent: 0,
    OrderItem: 0,
    Order: 0,
    ProductCost: 0,
    InventoryRecord: 0,
    Product: 0,
    Customer: 0,
    AutomationRun: 0,
    Automation: 0,
    DraftAction: 0,
    Invitation: 0,
  };
}

async function classify(organizationId) {
  const seedOrders = await prisma.order.findMany({
    where: {
      organizationId,
      source: { not: 'shopify' },
      OR: [
        { source: { in: deleteSources.map((source) => source.toLowerCase()) } },
        { externalId: { startsWith: 'seed-order-' } },
        { externalId: { startsWith: 'demo-order-' } },
        { externalId: { startsWith: 'test-order-' } },
        { externalId: { startsWith: 'smoke-order-' } },
        { notes: 'Seed demo order' },
        { notes: { startsWith: 'SMOKE:' } },
        {
          customerName: 'Smoke Test Customer',
          items: { some: { name: 'Smoke Test Product' } },
        },
        { events: { some: { type: 'seeded' } } },
      ],
    },
    select: { id: true, customerId: true },
  });
  const seedOrderIds = seedOrders.map((order) => order.id);
  const seedCustomerIds = seedOrders
    .map((order) => order.customerId)
    .filter((id) => typeof id === 'string');

  const seedProducts = await prisma.product.findMany({
    where: {
      organizationId,
      OR: [
        { externalId: { startsWith: 'seed-product-' } },
        { externalId: { startsWith: 'demo-product-' } },
        { externalId: { startsWith: 'test-product-' } },
        { externalId: { startsWith: 'smoke-product-' } },
        { sku: { startsWith: 'SMOKE-' } },
      ],
    },
    select: { id: true },
  });
  const seedProductIds = seedProducts.map((product) => product.id);

  const seedParcels = await prisma.parcel.findMany({
    where: { orderId: { in: seedOrderIds } },
    select: { id: true },
  });
  const seedParcelIds = seedParcels.map((parcel) => parcel.id);
  const smokeAutomations = await prisma.automation.findMany({
    where: {
      organizationId,
      OR: [
        { name: { startsWith: 'SMOKE:' } },
        { name: { startsWith: 'Smoke dry-run automation ' } },
      ],
    },
    select: { id: true },
  });
  const smokeAutomationIds = smokeAutomations.map((automation) => automation.id);

  const uncertain = {
    orders: await prisma.order.findMany({
      where: {
        organizationId,
        source: { not: 'shopify' },
        NOT: { id: { in: seedOrderIds } },
        OR: [{ orderNumber: { in: seedOrderNumbers } }, { tags: { has: 'demo' } }],
      },
      select: { id: true, source: true, orderNumber: true },
      take: 250,
    }),
    products: await prisma.product.findMany({
      where: {
        organizationId,
        NOT: { id: { in: seedProductIds } },
        sku: { in: seedSkus },
      },
      select: { id: true, sku: true },
      take: 250,
    }),
    customers: await prisma.customer.findMany({
      where: {
        organizationId,
        phone: { in: seedPhones },
        orders: { some: { id: { notIn: seedOrderIds } } },
      },
      select: { id: true },
      take: 250,
    }),
  };

  return {
    seedOrderIds,
    seedCustomerIds,
    seedProductIds,
    seedParcelIds,
    smokeAutomationIds,
    uncertain,
  };
}

async function collectCounts(organizationId, classified) {
  const { seedOrderIds, seedCustomerIds, seedProductIds, seedParcelIds, smokeAutomationIds } =
    classified;
  const [
    orderCostSnapshots,
    parcelEvents,
    parcels,
    fulfillmentTasks,
    confirmationTasks,
    orderEvents,
    orderItems,
    orders,
    productCosts,
    inventoryRecords,
    products,
    customers,
    automationRuns,
    automations,
    draftActions,
    invitations,
  ] = await Promise.all([
    prisma.orderCostSnapshot.count({ where: { orderId: { in: seedOrderIds } } }),
    prisma.parcelEvent.count({ where: { parcelId: { in: seedParcelIds } } }),
    prisma.parcel.count({ where: { id: { in: seedParcelIds } } }),
    prisma.fulfillmentTask.count({ where: { orderId: { in: seedOrderIds } } }),
    prisma.confirmationTask.count({ where: { orderId: { in: seedOrderIds } } }),
    prisma.orderEvent.count({ where: { orderId: { in: seedOrderIds } } }),
    prisma.orderItem.count({ where: { orderId: { in: seedOrderIds } } }),
    prisma.order.count({ where: { id: { in: seedOrderIds } } }),
    prisma.productCost.count({ where: { productId: { in: seedProductIds } } }),
    prisma.inventoryRecord.count({
      where: { OR: [{ productId: { in: seedProductIds } }, { reason: 'Seed stock' }] },
    }),
    prisma.product.count({ where: { id: { in: seedProductIds } } }),
    prisma.customer.count({
      where: {
        organizationId,
        OR: [
          { phone: { in: seedPhones } },
          { id: { in: seedCustomerIds } },
        ],
        orders: { every: { id: { in: seedOrderIds } } },
      },
    }),
    prisma.automationRun.count({
      where: {
        organizationId,
        OR: [
          { inputSnapshot: { path: ['seeded'], equals: true } },
          { automationId: { in: smokeAutomationIds } },
        ],
      },
    }),
    prisma.automation.count({ where: { id: { in: smokeAutomationIds }, organizationId } }),
    prisma.draftAction.count({
      where: {
        organizationId,
        OR: [
          { payload: { path: ['seeded'], equals: true } },
          { title: { startsWith: 'SMOKE:' } },
          { title: { startsWith: 'Smoke dry-run automation ' } },
        ],
      },
    }),
    prisma.invitation.count({ where: { organizationId, email: 'operator@Shopy.app' } }),
  ]);

  return {
    ...zeroCounts(),
    OrderCostSnapshot: orderCostSnapshots,
    ParcelEvent: parcelEvents,
    Parcel: parcels,
    FulfillmentTask: fulfillmentTasks,
    ConfirmationTask: confirmationTasks,
    OrderEvent: orderEvents,
    OrderItem: orderItems,
    Order: orders,
    ProductCost: productCosts,
    InventoryRecord: inventoryRecords,
    Product: products,
    Customer: customers,
    AutomationRun: automationRuns,
    Automation: automations,
    DraftAction: draftActions,
    Invitation: invitations,
  };
}

async function executeCleanup(organizationId, classified) {
  const { seedOrderIds, seedCustomerIds, seedProductIds, seedParcelIds, smokeAutomationIds } =
    classified;
  return prisma.$transaction(async (tx) => {
    const deleted = zeroCounts();
    deleted.OrderCostSnapshot = (
      await tx.orderCostSnapshot.deleteMany({ where: { orderId: { in: seedOrderIds } } })
    ).count;
    deleted.ParcelEvent = (
      await tx.parcelEvent.deleteMany({ where: { parcelId: { in: seedParcelIds } } })
    ).count;
    deleted.Parcel = (await tx.parcel.deleteMany({ where: { id: { in: seedParcelIds } } })).count;
    deleted.FulfillmentTask = (
      await tx.fulfillmentTask.deleteMany({ where: { orderId: { in: seedOrderIds } } })
    ).count;
    deleted.ConfirmationTask = (
      await tx.confirmationTask.deleteMany({ where: { orderId: { in: seedOrderIds } } })
    ).count;
    deleted.OrderEvent = (
      await tx.orderEvent.deleteMany({ where: { orderId: { in: seedOrderIds } } })
    ).count;
    deleted.OrderItem = (
      await tx.orderItem.deleteMany({ where: { orderId: { in: seedOrderIds } } })
    ).count;
    deleted.Order = (await tx.order.deleteMany({ where: { id: { in: seedOrderIds } } })).count;
    deleted.ProductCost = (
      await tx.productCost.deleteMany({ where: { productId: { in: seedProductIds } } })
    ).count;
    deleted.InventoryRecord = (
      await tx.inventoryRecord.deleteMany({
        where: { OR: [{ productId: { in: seedProductIds } }, { reason: 'Seed stock' }] },
      })
    ).count;
    deleted.Product = (
      await tx.product.deleteMany({ where: { id: { in: seedProductIds } } })
    ).count;
    deleted.Customer = (
      await tx.customer.deleteMany({
        where: {
          organizationId,
          OR: [{ phone: { in: seedPhones } }, { id: { in: seedCustomerIds } }],
          orders: { none: {} },
        },
      })
    ).count;
    deleted.AutomationRun = (
      await tx.automationRun.deleteMany({
        where: {
          organizationId,
          OR: [
            { inputSnapshot: { path: ['seeded'], equals: true } },
            { automationId: { in: smokeAutomationIds } },
          ],
        },
      })
    ).count;
    deleted.DraftAction = (
      await tx.draftAction.deleteMany({
        where: {
          organizationId,
          OR: [
            { payload: { path: ['seeded'], equals: true } },
            { title: { startsWith: 'SMOKE:' } },
            { title: { startsWith: 'Smoke dry-run automation ' } },
          ],
        },
      })
    ).count;
    deleted.Automation = (
      await tx.automation.deleteMany({ where: { id: { in: smokeAutomationIds }, organizationId } })
    ).count;
    deleted.Invitation = (
      await tx.invitation.deleteMany({ where: { organizationId, email: 'operator@Shopy.app' } })
    ).count;
    return deleted;
  });
}

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true, slug: true },
  });
  if (!organization) throw new Error(`Organization slug not found: ${organizationSlug}`);

  const classified = await classify(organization.id);
  const dryRunCounts = await collectCounts(organization.id, classified);
  const uncertainCount = Object.values(classified.uncertain).reduce(
    (sum, rows) => sum + rows.length,
    0,
  );

  if (uncertainCount) {
    fs.mkdirSync('tmp', { recursive: true });
    fs.writeFileSync(
      path.join('tmp', `data-cleanup-review-${organization.slug}.json`),
      JSON.stringify(classified.uncertain, null, 2),
    );
  }

  const selectedShopifyRecords = await prisma.order.count({
    where: { id: { in: classified.seedOrderIds }, source: 'shopify' },
  });
  const protectedCounts = {
    Integration: 0,
    User: 0,
    Organization: 0,
    ShopifySelected: selectedShopifyRecords,
  };

  if (!execute) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          organization: organization.slug,
          deleteSources,
          counts: dryRunCounts,
          protectedCounts,
          uncertainReviewFile: uncertainCount
            ? `tmp/data-cleanup-review-${organization.slug}.json`
            : null,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Execution requires NODE_ENV=production.');
  }
  if (process.env.CONFIRM_DATA_CLEANUP !== organization.slug) {
    throw new Error('Execution requires CONFIRM_DATA_CLEANUP to equal the organization slug.');
  }
  for (const required of ['SEED', 'DEMO', 'TEST', 'SMOKE']) {
    if (!deleteSources.includes(required)) {
      throw new Error('Execution requires DELETE_SOURCES to include SEED,DEMO,TEST,SMOKE.');
    }
  }
  if (selectedShopifyRecords > 0) {
    throw new Error('Safety check failed: Shopify-sourced records were selected.');
  }
  if (process.env.BACKUP_CONFIRMED !== 'true') {
    throw new Error(
      'Execution requires BACKUP_CONFIRMED=true after Neon backup/branch is verified.',
    );
  }

  const deleted = await executeCleanup(organization.id, classified);
  console.log(
    JSON.stringify(
      {
        mode: 'execute',
        organization: organization.slug,
        deleted,
        protectedCounts,
        uncertainReviewFile: uncertainCount
          ? `tmp/data-cleanup-review-${organization.slug}.json`
          : null,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Cleanup failed');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
