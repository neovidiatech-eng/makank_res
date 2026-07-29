// One-off, READ-ONLY diagnostic script — makes zero writes to the database.
// Given a storeId (and optionally a plaintext password to test), prints
// exactly what's on file for that store's owner account right now, so we
// can tell apart "the password change never saved" from "it saved fine but
// login is rejecting it for some other reason" instead of guessing further.
//
// Run on the target server, from the repo root:
//   npx ts-node -r tsconfig-paths/register prisma/seeds/debug-store-login.ts <storeId> [passwordToTest]
//
// Example:
//   npx ts-node -r tsconfig-paths/register prisma/seeds/debug-store-login.ts 128 "NewPass@123"

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const storeId = Number(process.argv[2]);
  const passwordToTest = process.argv[3];

  if (!storeId || isNaN(storeId)) {
    console.error('Usage: debug-store-login.ts <storeId> [passwordToTest]');
    process.exit(1);
  }

  await prisma.$connect();

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, isStoreAccepted: true, isBlocked: true },
  });
  if (!store) {
    console.log(`No store with id ${storeId}.`);
    await prisma.$disconnect();
    return;
  }
  console.log('Store:', store);

  // Every Store-role user tied to this storeId, oldest first — the first
  // one (lowest id) is the one PATCH /stores/:id's User field actually
  // updates, and the one the dashboard's edit form prefills from.
  const users = await prisma.user.findMany({
    where: { storeId, roleKey: 'Store' },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      verified: true,
      roleId: true,
      password: true,
      deletedAt: true,
      Role: { select: { id: true, name: true, default: true, roleKey: true } },
    },
  });

  if (!users.length) {
    console.log('No Store-role user found for this storeId at all.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nFound ${users.length} Store-role user(s) for storeId ${storeId}:\n`);

  for (const [index, u] of users.entries()) {
    const isOwner = index === 0;
    console.log(
      `${isOwner ? '>>> OWNER (lowest id — this is who gets updated/logged in as)' : '    employee'}`,
    );
    console.log({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      active: u.active,
      verified: u.verified,
      deletedAt: u.deletedAt,
      roleId: u.roleId,
      roleIsDefaultStoreRole: u.Role?.default === true && u.Role?.roleKey === 'Store',
      roleName: u.Role?.name,
      passwordHashPrefix: u.password?.slice(0, 10) + '...',
      passwordHashLength: u.password?.length,
    });

    if (passwordToTest) {
      const matches = bcrypt.compareSync(passwordToTest, u.password);
      console.log(
        `    Does "${passwordToTest}" match this user's stored hash? -> ${matches ? '✅ YES' : '❌ NO'}`,
      );
    }
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
