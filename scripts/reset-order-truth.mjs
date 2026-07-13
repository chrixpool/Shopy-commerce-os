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
const organizationSlug = args.get('org') || process.env.ORDER_TRUTH_RESET_ORG;

if (!organizationSlug) {
  console.error('Missing organization slug. Use --org=<slug>.');
  process.exit(1);
}

async function inspect(organizationId) {
  const shopifyWhere = { organizationId, source: 'shopify' };
  const [
    orders,
    orderStatuses,
    confirmationStatuses,
    fulfillmentTasks,
    internalParcels,
    linkedProviderParcels,
    derivedEvents,
    resetEvents,
    snapshots,
  ] = await Promise.all([
    prisma.order.count({ where: shopifyWhere }),
    prisma.order.groupBy({ by: ['status'], where: shopifyWhere, _count: { _all: true } }),
    prisma.confirmationTask.groupBy({
      by: ['status'],
      where: { order: shopifyWhere },
      _count: { _all: true },
    }),
    prisma.fulfillmentTask.count({ where: { order: shopifyWhere } }),
    prisma.parcel.count({
      where: { order: { ...shopifyWhere, providerParcels: { none: {} } } },
    }),
    prisma.providerParcel.count({ where: { order: shopifyWhere } }),
    prisma.orderEvent.count({
      where: {
        order: shopifyWhere,
        userId: null,
        type: { in: ['confirmation_action', 'fulfillment_action', 'delivery_action', 'status_change'] },
      },
    }),
    prisma.orderEvent.count({ where: { order: shopifyWhere, type: 'order_truth_reset' } }),
    prisma.orderCostSnapshot.count({ where: { order: shopifyWhere } }),
  ]);

  return {
    shopifyOrders: orders,
    orderStatuses: Object.fromEntries(orderStatuses.map((row) => [row.status, row._count._all])),
    confirmationStatuses: Object.fromEntries(
      confirmationStatuses.map((row) => [row.status, row._count._all]),
    ),
    fulfillmentTasks,
    internalParcels,
    linkedProviderParcels,
    derivedEvents,
    resetEvents,
    costSnapshots: snapshots,
    proposed: {
      ordersToPending: orders - (orderStatuses.find((row) => row.status === 'PENDING')?._count._all ?? 0),
      confirmationsToPending:
        orders -
        (confirmationStatuses.find((row) => row.status === 'PENDING')?._count._all ?? 0),
      fulfillmentTasksToDelete: fulfillmentTasks,
      unlinkedInternalParcelsToDelete: internalParcels,
      derivedEventsToDelete: derivedEvents,
      resetEventsToCreate: Math.max(orders - resetEvents, 0),
    },
  };
}

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true, slug: true },
  });
  if (!organization) throw new Error('Organization not found.');

  const before = await inspect(organization.id);
  console.log(JSON.stringify({ mode: execute ? 'EXECUTE' : 'DRY_RUN', organization: organization.slug, before }, null, 2));
  if (!execute) return;

  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Execution requires NODE_ENV=production.');
  }
  if (process.env.CONFIRM_ORDER_TRUTH_RESET !== organization.slug) {
    throw new Error('CONFIRM_ORDER_TRUTH_RESET must exactly match the organization slug.');
  }
  if (process.env.NEON_RECOVERY_BRANCH_CONFIRMED !== 'true') {
    throw new Error('NEON_RECOVERY_BRANCH_CONFIRMED=true is required.');
  }

  await prisma.$transaction(
    async (tx) => {
      const orders = await tx.order.findMany({
        where: { organizationId: organization.id, source: 'shopify' },
        select: {
          id: true,
          status: true,
          confirmationTask: { select: { status: true } },
          fulfillmentTask: { select: { id: true } },
          providerParcels: { select: { id: true }, take: 1 },
          parcel: { select: { id: true } },
          events: { where: { type: 'order_truth_reset' }, select: { id: true }, take: 1 },
        },
      });
      const orderIds = orders.map((order) => order.id);

      await tx.orderEvent.deleteMany({
        where: {
          orderId: { in: orderIds },
          userId: null,
          type: {
            in: ['confirmation_action', 'fulfillment_action', 'delivery_action', 'status_change'],
          },
        },
      });
      await tx.fulfillmentTask.deleteMany({ where: { orderId: { in: orderIds } } });
      const unlinkedParcelIds = orders
        .filter((order) => order.parcel && order.providerParcels.length === 0)
        .map((order) => order.parcel.id);
      if (unlinkedParcelIds.length) {
        await tx.parcel.deleteMany({ where: { id: { in: unlinkedParcelIds } } });
      }
      await tx.confirmationTask.createMany({
        data: orders
          .filter((order) => !order.confirmationTask)
          .map((order) => ({ orderId: order.id, status: 'PENDING' })),
        skipDuplicates: true,
      });
      await tx.confirmationTask.updateMany({
        where: { orderId: { in: orderIds } },
        data: {
          status: 'PENDING',
          attempts: 0,
          notes: null,
          scheduledAt: null,
          assignedToId: null,
        },
      });
      await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: { status: 'PENDING' },
      });
      await tx.orderEvent.createMany({
        data: orders
          .filter((order) => order.events.length === 0)
          .map((order) => ({
            orderId: order.id,
            type: 'order_truth_reset',
            note: 'Shopy lifecycle reset to awaiting confirmation',
            data: {
              source: 'SYSTEM',
              previousOrderStatus: order.status,
              previousConfirmationStatus: order.confirmationTask?.status ?? null,
              fulfillmentTaskRemoved: Boolean(order.fulfillmentTask),
            },
          })),
        skipDuplicates: true,
      });
    },
    { timeout: 60_000 },
  );

  const after = await inspect(organization.id);
  console.log(JSON.stringify({ mode: 'COMPLETE', organization: organization.slug, after }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Order truth reset failed.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
