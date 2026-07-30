// One-off, READ-ONLY diagnostic script — zero writes.
// Given an orderId, prints the order's actual status + financial fields,
// and the associated branch's Wallet row — so we can tell apart "the order
// never actually reached DELIVERED yet" from "it did, and distributeEarnings
// should have credited the wallet but didn't" instead of guessing.
//
// Run on the target server, from the repo root:
//   npx ts-node -r tsconfig-paths/register prisma/seeds/debug-order-wallet.ts <orderId>

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orderId = Number(process.argv[2]);
  if (!orderId || isNaN(orderId)) {
    console.error('Usage: debug-order-wallet.ts <orderId>');
    process.exit(1);
  }

  await prisma.$connect();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      type: true,
      paymentMethod: true,
      paymentStatus: true,
      paidWithWallet: true,
      totalPriceAfterDiscount: true,
      adminCommission: true,
      shipping: true,
      tax: true,
      branchId: true,
      deliveryId: true,
      createdAt: true,
    },
  });

  if (!order) {
    console.log(`No order with id ${orderId}.`);
    await prisma.$disconnect();
    return;
  }

  console.log('Order:', order);

  if (order.status !== 'DELIVERED') {
    console.log(
      `\n⚠️  This order's status is "${order.status}", not "DELIVERED" yet.`,
    );
    console.log(
      '    distributeEarnings() — the wallet-crediting step — only runs on the',
    );
    console.log(
      '    transition INTO DELIVERED. Nothing gets credited before that,',
    );
    console.log(
      '    even if the driver has physically arrived (that\'s ON_THE_WAY, a',
    );
    console.log('    separate status from DELIVERED).');
  }

  if (order.branchId) {
    const wallet = await prisma.wallet.findUnique({
      where: { branchId: order.branchId },
    });
    console.log('\nBranch Wallet (current state):', wallet);

    // What distributeEarnings() would have added for this order, for reference.
    const branchEarning =
      (order.totalPriceAfterDiscount ?? 0) -
      (order.adminCommission ?? 0) -
      (order.shipping ?? 0);
    console.log(
      `\nExpected branch earning from this order if DELIVERED: ${branchEarning}`,
    );

    // The authoritative proof: changeStatus() logs an ORDER_COMPLETED
    // transaction in the SAME db transaction as distributeEarnings() the
    // moment status flips to DELIVERED. If this row exists, the credit
    // definitely fired for this exact order — comparing wallet totals alone
    // can't prove that on its own (other orders contribute to the same
    // running total).
    const ledgerEntry = await (prisma as any).transaction.findFirst({
      where: { referenceId: orderId, type: 'ORDER_COMPLETED', branchId: order.branchId },
    });
    console.log('\nORDER_COMPLETED ledger entry for this exact order:', ledgerEntry);
    console.log(
      ledgerEntry
        ? '\n✅ The credit DID fire for this order (ledger entry exists).'
        : '\n❌ NO ledger entry found — distributeEarnings() never ran for this order.',
    );
  } else {
    console.log('\nThis order has no branchId at all (custom-delivery order?).');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
