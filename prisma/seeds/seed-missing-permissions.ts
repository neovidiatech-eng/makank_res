// One-off, production-safe script: seeds ONLY Permissions/Roles/RolePermissions
// (all upserts — creates anything missing, never deletes or overwrites an
// existing row's grants). Safe to run against a live database with real
// data — unlike `npm run db:seed`, this does NOT touch admin/customer/store/
// order data. Fixes 403s on newly-added permissions (e.g. store-zone-pricing)
// that were added to the code but never synced to this database.
//
// Run on the target server (e.g. api.makanak-app.com), from the repo root:
//   npx ts-node -r tsconfig-paths/register prisma/seeds/seed-missing-permissions.ts
//
// Requires DATABASE_URL in that environment's .env to point at the target DB.
// Takes effect immediately — permissions are read fresh from the DB on every
// request (access-token.strategy.ts), so no one needs to log out/in again.

import { PrismaClient } from '@prisma/client';
import { seedPermissions, seedRoles, seedRolePermissions } from './permissionAndRoles.seed';

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();
  await seedPermissions(prisma);
  await seedRoles(prisma);
  await seedRolePermissions(prisma);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
