// One-off, READ-ONLY diagnostic script — makes zero writes to the database.
// Prints exactly what's stored for one order's items/sizes/addons, so we can
// tell apart "the data was never saved at order-creation time" from "it's
// saved fine but not reaching the client" instead of guessing further.
//
// Run on the target server, from the repo root:
//   npx ts-node -r tsconfig-paths/register prisma/seeds/debug-order-items.ts <orderId>

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orderId = Number(process.argv[2]);
  if (!orderId || isNaN(orderId)) {
    console.error('Usage: debug-order-items.ts <orderId>');
    process.exit(1);
  }

  await prisma.$connect();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      OrderItems: {
        include: {
          Service: { select: { id: true, name: true, price: true } },
          Size: true,
          OrderItemAddons: { include: { Addon: true } },
        },
      },
      Branch: { select: { id: true, storeId: true } },
      Customer: { select: { id: true, name: true, phone: true } },
    },
  });

  if (!order) {
    console.log(`No order with id ${orderId}.`);
  } else {
    console.log(JSON.stringify(order, null, 2));
    console.log(`\nOrderItems count: ${order.OrderItems.length}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
