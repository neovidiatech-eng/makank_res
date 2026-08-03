// One-off, READ-ONLY diagnostic script — zero writes.
// Given an employee's email or phone, prints every field that could cause
// a login attempt to fail (active/verified/deletedAt/roleKey/role/store),
// plus how many sessions currently exist for that account — so we can
// pin down "can log in before, can't now" instead of guessing.
//
// Run on the target server, from the repo root:
//   npx ts-node -r tsconfig-paths/register prisma/seeds/debug-employee-login.ts <email-or-phone>

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error('Usage: debug-employee-login.ts <email-or-phone>');
    process.exit(1);
  }

  await prisma.$connect();

  const users = await prisma.user.findMany({
    where: {
      OR: [{ email: identifier }, { phone: identifier }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      roleKey: true,
      active: true,
      verified: true,
      deletedAt: true,
      branchId: true,
      storeId: true,
      createdAt: true,
      Role: { select: { id: true, name: true, default: true, storeId: true } },
    },
  });

  if (users.length === 0) {
    console.log(`No user found with email/phone "${identifier}" (any role, including soft-deleted).`);
    await prisma.$disconnect();
    return;
  }

  for (const user of users) {
    console.log('\n=== User', user.id, '===');
    console.log(user);

    if (user.deletedAt) {
      console.log('⚠️  Soft-deleted (deletedAt set) — login findFirst filters deletedAt: null, so this account cannot log in at all with this email/phone until restored.');
    }
    if (user.active === false) {
      console.log('⚠️  active = false — login will reject with DISABLED_ACCOUNT.');
    }
    if (user.roleKey !== 'Store') {
      console.log(`ℹ️  roleKey is "${user.roleKey}", not "Store" — the client must POST to /authentication/login/${user.roleKey} exactly, not /authentication/login/Store.`);
    }
    if (user.Role && user.storeId && user.Role.storeId && user.Role.storeId !== user.storeId) {
      console.log('⚠️  This user\'s Role.storeId does not match the user\'s own storeId — role/store mismatch.');
    }

    const sessionCount = await prisma.session.count({ where: { userId: user.id } });
    console.log(`Active sessions for this user: ${sessionCount}`);
  }

  console.log('\nOther things worth checking manually if everything above looks fine:');
  console.log('- Exact HTTP status/body the app received on the failing attempt (401/422/429/500 all point to different causes).');
  console.log('- Whether the login request body includes a stale "phone" field alongside the correct email+password — the login lookup ANDs both when both are sent.');
  console.log('- If the response was 429: this is the per-IP rate limiter blocking /authentication/login/Store for that IP for up to 1 hour after repeated attempts, not an account issue.');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
