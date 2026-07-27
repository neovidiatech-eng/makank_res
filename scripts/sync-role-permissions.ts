/**
 * Re-syncs Permission/Role/RolePermission rows from the static role
 * definitions in src/_modules/authorization/providers/roles/*.ts — the
 * subset of the full seed that's safe to re-run any time (fully upsert-based,
 * never deletes or duplicates). Needed whenever a role's permission map
 * changes in code (e.g. Store gaining `logs:get`) without wanting to re-run
 * the full db:seed (which also regenerates demo/comprehensive test data).
 *
 * Usage: ts-node -r tsconfig-paths/register scripts/sync-role-permissions.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  seedPermissions,
  seedRolePermissions,
  seedRoles,
} from '../prisma/seeds/permissionAndRoles.seed';

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();
  await seedPermissions(prisma);
  await seedRoles(prisma);
  await seedRolePermissions(prisma);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
