/* global console, process */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      slug: true,
      _count: {
        select: {
          orders: true,
          users: true,
          integrations: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  const counts = await Promise.all(
    organizations.map(async (organization) => ({
      id: organization.id,
      slug: organization.slug,
      orders: organization._count.orders,
      shopifyOrders: await prisma.order.count({
        where: { organizationId: organization.id, source: 'shopify' },
      }),
      smokeOrders: await prisma.order.count({
        where: { organizationId: organization.id, source: 'smoke' },
      }),
      users: organization._count.users,
      integrations: organization._count.integrations,
    })),
  );
  console.log(JSON.stringify(counts, null, 2));
} catch {
  console.error('Safe production count inspection failed.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
