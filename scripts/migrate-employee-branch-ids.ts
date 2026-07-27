/**
 * One-time backfill: link every pre-existing employee (Store-role user with
 * no branchId) to their store's main branch.
 *
 * Employees added via EmployeeService.create() before branchId became
 * required were left with branchId = null. Since the order list / order
 * notifications for Store-role users filter by branchId, a null branchId
 * means "see nothing" rather than "see everything" — those employees never
 * saw their store's orders. This backfill closes that gap for existing rows;
 * the branchId requirement in EmployeeService.create()/update() prevents new
 * ones. DRY-RUN BY DEFAULT.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/migrate-employee-branch-ids.ts            # dry-run
 *   ts-node -r tsconfig-paths/register scripts/migrate-employee-branch-ids.ts --apply    # write
 */

import { PrismaClient } from '@prisma/client';

function log(line = '') {
  // eslint-disable-next-line no-console
  console.log(line);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();

  try {
    const employees = await prisma.user.findMany({
      where: {
        roleKey: 'Store',
        branchId: null,
        storeId: { not: null },
        deletedAt: null,
      },
      select: { id: true, name: true, email: true, storeId: true },
    });

    log(`Found ${employees.length} employee(s) with no branchId.`);
    if (employees.length === 0) {
      log('Nothing to do.');
      return;
    }

    const resolved: { userId: number; branchId: number }[] = [];
    const unresolved: { userId: number; storeId: number; reason: string }[] = [];

    for (const employee of employees) {
      const storeId = employee.storeId as number;
      const branch =
        (await prisma.branch.findFirst({
          where: { storeId, isMainBranch: true },
        })) ?? (await prisma.branch.findFirst({ where: { storeId } }));

      if (!branch) {
        unresolved.push({
          userId: employee.id,
          storeId,
          reason: 'store has no branches',
        });
        continue;
      }
      resolved.push({ userId: employee.id, branchId: branch.id });
      log(
        `  user #${employee.id} (${employee.name} <${employee.email}>) store=${storeId} -> branch #${branch.id}`,
      );
    }

    if (unresolved.length) {
      log('');
      log(`${unresolved.length} row(s) could NOT be resolved (needs manual review):`);
      for (const u of unresolved) {
        log(`  user #${u.userId} store=${u.storeId}: ${u.reason}`);
      }
    }

    if (!apply) {
      log('');
      log(`Dry-run only. ${resolved.length} row(s) would be updated. Re-run with --apply to write.`);
      return;
    }

    await prisma.$transaction(
      resolved.map((r) =>
        prisma.user.update({
          where: { id: r.userId },
          data: { branchId: r.branchId },
        }),
      ),
    );
    log('');
    log(`Applied. ${resolved.length} row(s) updated.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
