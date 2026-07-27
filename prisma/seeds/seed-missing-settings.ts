// One-off, production-safe script: seeds ONLY the Settings table (upsert —
// creates missing settings with their default value, never overwrites an
// existing one). Safe to run against a live database with real data — unlike
// `npm run db:seed`, this does NOT touch admin/customer/store/order data.
//
// Run on the target server (e.g. api.makanak-app.com), from the repo root:
//   npx ts-node -r tsconfig-paths/register prisma/seeds/seed-missing-settings.ts
//
// Requires DATABASE_URL in that environment's .env to point at the target DB.

import { PrismaClient } from '@prisma/client';
import { seedSettings } from './settings.seed';

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();
  await seedSettings(prisma);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
