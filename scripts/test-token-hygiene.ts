/**
 * Manual verification for the FCM token-hygiene fix.
 *
 * Background: a single device's FCM token must belong to exactly ONE user at a time.
 * The bug attached a token to every user who ever logged in on the same device, so a push
 * meant for one customer reached other users. The fix (TokenService.generateToken) detaches the
 * token from ALL sessions before reattaching it to the new login.
 *
 * This script calls the REAL TokenService.generateToken directly (the actual fixed code) — no HTTP,
 * no login/locale/body dependencies. It creates two throwaway users, simulates each "logging in"
 * on the SAME device token (ACCESS + REFRESH, like the real login flow), then checks the `sessions`
 * table: the token must end up on the second user ONLY. Finally it deletes the test users
 * (sessions + details cascade away).
 *
 * Prerequisites: MySQL up, roles seeded (npm run db:seed), and token secrets present in .env.
 * The dev server does NOT need to be running.
 *
 * Run (transpile-only avoids type-checking the imported app graph):
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-token-hygiene.ts
 *
 * Optional:  --keep   leave the test users/sessions in place for manual inspection.
 */
import 'dotenv/config';
// Registers the global `env()` helper that app config files (e.g. jwt.config) call at import time.
// Must come before importing TokenService.
import '../src/declares/functions/env';
import { PrismaClient, SessionType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { TokenService } from '../src/_modules/authentication/services/jwt.service';

const prisma = new PrismaClient();

// TokenService only uses prisma + configService.get(key); a tiny stub backed by process.env is enough.
const tokenService = new TokenService(
  prisma as any,
  { get: (k: string) => process.env[k] } as any,
);

const KEEP = process.argv.includes('--keep');
const ROLE = 'Customer'; // RolesKeys.CUSTOMER value (capitalized in this codebase)
const IP = '::1';
const TOKEN = `DEVICE_TEST_${Date.now()}`; // unique per run

const stamp = Date.now();
const USER_A = { name: 'Token Test A', email: `tokentest_a_${stamp}@makanak.test`, phone: `+20100${stamp % 10000000}` };
const USER_B = { name: 'Token Test B', email: `tokentest_b_${stamp}@makanak.test`, phone: `+20111${stamp % 10000000}` };

async function ensureUser(u: { name: string; email: string; phone: string }, roleId: number) {
  const password = bcrypt.hashSync('Test@1234', 10);
  return prisma.user.upsert({
    where: { email_roleKey: { email: u.email, roleKey: ROLE } },
    update: { roleId },
    create: {
      name: u.name,
      email: u.email,
      phone: u.phone,
      password,
      verified: true,
      active: true,
      roleKey: ROLE,
      roleId,
      Details: { create: {} },
    },
    select: { id: true, email: true },
  });
}

// Simulate a login: the real flow generates an ACCESS then a REFRESH token, both with the same fcm.
async function simulateLogin(userId: number) {
  await tokenService.generateToken(userId, IP, TOKEN, SessionType.ACCESS, 'en');
  await tokenService.generateToken(userId, IP, TOKEN, SessionType.REFRESH, 'en');
}

async function crossUserDuplicates() {
  return prisma.$queryRawUnsafe<Array<{ fcmToken: string; users: bigint }>>(
    `SELECT fcm_token AS fcmToken, COUNT(DISTINCT user_id) AS users
     FROM sessions
     WHERE fcm_token IS NOT NULL
     GROUP BY fcm_token
     HAVING COUNT(DISTINCT user_id) > 1`,
  );
}

async function main() {
  console.log(`Test token: ${TOKEN}\n`);

  const role = await prisma.role.findFirst({ where: { roleKey: ROLE }, select: { id: true } });
  if (!role) throw new Error(`Role "${ROLE}" not found — run "npm run db:seed" first.`);

  console.log('Creating two throwaway users...');
  const a = await ensureUser(USER_A, role.id);
  const b = await ensureUser(USER_B, role.id);
  console.log(`  A = id ${a.id}\n  B = id ${b.id}\n`);

  let pass = true;
  try {
    console.log('1) User A "logs in" on the device token...');
    await simulateLogin(a.id);
    console.log('2) User B "logs in" on the SAME device token...\n');
    await simulateLogin(b.id);

    const owners = await prisma.session.findMany({
      where: { fcmToken: TOKEN },
      select: { userId: true, type: true },
      orderBy: [{ userId: 'asc' }, { type: 'asc' }],
    });
    console.log('Sessions currently holding the test token:');
    console.table(owners);

    const distinctUsers = [...new Set(owners.map((o) => o.userId))];
    if (distinctUsers.length === 1 && distinctUsers[0] === b.id) {
      console.log(`\n✅ PASS: token belongs to exactly one user — User B (id ${b.id}), the last login.`);
    } else {
      pass = false;
      console.log(
        `\n❌ FAIL: token is attached to user(s) [${distinctUsers.join(', ')}]. Expected only User B (id ${b.id}).`,
      );
      console.log('   (Before the fix, both A and B would hold the token — that is the bug.)');
    }

    const dups = await crossUserDuplicates();
    if (dups.length === 0) {
      console.log('✅ PASS: no FCM token is shared across multiple users (table-wide invariant).');
    } else {
      pass = false;
      console.log('❌ FAIL: these tokens are shared across users (the bug):');
      console.table(dups.map((d) => ({ fcmToken: d.fcmToken, users: Number(d.users) })));
    }
  } finally {
    if (!KEEP) {
      const { count } = await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
      console.log(`\nCleaned up ${count} test user(s) (sessions + details cascaded).`);
    } else {
      console.log(`\n--keep set: test users left in place (A=${a.id}, B=${b.id}).`);
    }
  }

  process.exitCode = pass ? 0 : 1;
}

main()
  .catch((e) => {
    console.error('\nError:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
