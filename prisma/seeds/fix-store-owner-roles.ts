// One-off, production-safe script: re-wires every store's owner (the
// earliest-created Store-role user for that storeId — same heuristic
// StoreService.updateOwnerCredentials() uses) onto the one true default
// Store role (roleKey: 'Store', default: true).
//
// Why this is needed: a bug in HelpersService.createUser() used to pick
// *any* Role row sharing roleKey: 'Store' (employee custom-roles share the
// same key) instead of specifically the default one. An affected owner logs
// in fine but then gets rejected on every permission-gated store endpoint
// (add category/product, etc.) — the account looks fine, its Role doesn't
// have the grants an owner needs. That bug is fixed for new stores; this
// script repairs any store created before the fix.
//
// Purely additive/corrective — only updates User.roleId on rows that are
// already wrong, touches nothing else, no deletions. Safe to run against a
// live database with real data. Idempotent: running it again does nothing
// once everything is already correct.
//
// Run on the target server, from the repo root:
//   npx ts-node -r tsconfig-paths/register prisma/seeds/fix-store-owner-roles.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();

  const defaultRole = await prisma.role.findFirst({
    where: { roleKey: 'Store', default: true },
  });
  if (!defaultRole) {
    throw new Error(
      'Default Store role (roleKey: Store, default: true) not found — run seed-missing-permissions.ts first.',
    );
  }

  const stores = await prisma.store.findMany({ select: { id: true } });

  let fixed = 0;
  let alreadyOk = 0;
  let noOwner = 0;

  for (const store of stores) {
    const owner = await prisma.user.findFirst({
      where: { storeId: store.id, roleKey: 'Store' },
      orderBy: { id: 'asc' },
    });

    if (!owner) {
      noOwner++;
      continue;
    }

    if (owner.roleId === defaultRole.id) {
      alreadyOk++;
      continue;
    }

    await prisma.user.update({
      where: { id: owner.id },
      data: { roleId: defaultRole.id },
    });
    fixed++;
    // eslint-disable-next-line no-console
    console.log(
      `Fixed store #${store.id} — owner user #${owner.id} (${owner.email}) moved from role #${owner.roleId} to default role #${defaultRole.id}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n✅ Done. ${fixed} owner(s) fixed, ${alreadyOk} already correct, ${noOwner} store(s) with no owner user found.`,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
