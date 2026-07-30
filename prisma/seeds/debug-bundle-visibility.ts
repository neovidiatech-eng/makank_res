// One-off, READ-ONLY diagnostic script — zero writes.
// Lists every bundle for a store (active or not) and, for each one, prints
// exactly why it would or wouldn't show up to a customer right now —
// checking the same isActive/deletedAt/startDate/endDate rule the real
// customer-facing GET /bundles endpoint uses (validBundleWhere).
//
// Run on the target server, from the repo root:
//   npx ts-node -r tsconfig-paths/register prisma/seeds/debug-bundle-visibility.ts <storeId>

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const storeId = Number(process.argv[2]);
  if (!storeId || isNaN(storeId)) {
    console.error('Usage: debug-bundle-visibility.ts <storeId>');
    process.exit(1);
  }

  await prisma.$connect();

  const bundles = await prisma.bundle.findMany({
    where: { storeId },
    include: {
      ScopeServices: { include: { Service: { select: { id: true, name: true, storeId: true } } } },
    },
    orderBy: { id: 'desc' },
  });

  if (!bundles.length) {
    console.log(`No bundles at all for storeId ${storeId} (not even inactive/deleted ones).`);
    await prisma.$disconnect();
    return;
  }

  const now = new Date();
  console.log(`Server "now": ${now.toISOString()}\n`);

  for (const b of bundles) {
    const reasons: string[] = [];
    if (b.deletedAt) reasons.push(`deleted at ${b.deletedAt.toISOString()}`);
    if (!b.isActive) reasons.push('isActive = false');
    if (b.startDate && b.startDate > now)
      reasons.push(`startDate is in the future (${b.startDate.toISOString()})`);
    if (b.endDate && b.endDate < now)
      reasons.push(`endDate is in the past (${b.endDate.toISOString()})`);
    if (!b.ScopeServices.length) reasons.push('has ZERO paid/free services scoped to it');

    console.log(`Bundle #${b.id} — "${JSON.stringify(b.title)}"`);
    console.log({
      isActive: b.isActive,
      deletedAt: b.deletedAt,
      startDate: b.startDate,
      endDate: b.endDate,
      pricingMode: b.pricingMode,
      scopedServiceCount: b.ScopeServices.length,
      scopedServices: b.ScopeServices.map((s) => ({
        role: s.role,
        serviceId: s.serviceId,
        belongsToThisStore: s.Service?.storeId === storeId,
      })),
    });
    console.log(
      reasons.length
        ? `    ❌ WOULD NOT show to a customer right now — ${reasons.join('; ')}`
        : `    ✅ WOULD show to a customer right now`,
    );
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
