/**
 * One-time schedule TIME migration (Option A) — DRY-RUN BY DEFAULT.
 *
 * Shifts StoreSchedule (+3h) and DeliverySchedule (+2h) opening/closing TIME values so the
 * new zero-offset Egypt-wall-clock reads reproduce the intended schedules. See
 * `timezone-schedule-migration.core.ts` and the timezone remediation plan.
 *
 * Usage (run off-peak, take a DB snapshot first):
 *   ts-node -r tsconfig-paths/register scripts/timezone-schedule-migration.ts            # dry-run
 *   ts-node -r tsconfig-paths/register scripts/timezone-schedule-migration.ts --apply    # write
 *   ... --reverse [--apply]        # roll back (subtract the offset)
 *   ... --store-offset 3 --delivery-offset 2   # tune offsets (validate via dry-run!)
 *   ... --at 2026-07-01T09:00:00Z  # pin the cutover instant (default: now)
 *   ... --force                    # apply despite a cutover-instant divergence (after review)
 *
 * --apply refuses to write if any row diverges AT THE CUTOVER INSTANT (status-neutrality gate),
 * unless --force is given. The 24h sweep divergences are reported for visibility.
 *
 * NOTE: this script only WRITES with --apply. Do not run --apply until the dry-run has been
 * reviewed on a production snapshot and reports STATUS-NEUTRAL (see plan guardrails).
 */

import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_OFFSET_HOURS,
  RowMigration,
  ScheduleKind,
  ScheduleRow,
  buildProbeInstants,
  evaluateRowMigration,
  timeColumnLabel,
} from './timezone-schedule-migration.core';

interface Args {
  apply: boolean;
  reverse: boolean;
  force: boolean;
  storeOffset: number;
  deliveryOffset: number;
  at?: Date;
  step: number;
}

function parseArgs(argv: string[]): Args {
  const has = (f: string) => argv.includes(f);
  const val = (f: string): string | undefined => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const num = (f: string, d: number) => {
    const v = val(f);
    return v === undefined ? d : Number(v);
  };
  const atStr = val('--at');
  return {
    apply: has('--apply'),
    reverse: has('--reverse'),
    force: has('--force'),
    storeOffset: num('--store-offset', DEFAULT_OFFSET_HOURS.store),
    deliveryOffset: num('--delivery-offset', DEFAULT_OFFSET_HOURS.delivery),
    at: atStr ? new Date(atStr) : undefined,
    step: num('--step', 15),
  };
}

function log(line = '') {
  // eslint-disable-next-line no-console
  console.log(line);
}

function dumpTable(kind: ScheduleKind, migrations: RowMigration[], reverse: boolean) {
  log('');
  log(`=== ${kind.toUpperCase()}SCHEDULE — ${migrations.length} rows ===`);
  for (const m of migrations) {
    const flag = m.cutoverDiverges ? ' ⚠ CUTOVER-DIVERGENCE' : '';
    log(
      `  #${m.row.id} owner=${m.row.ownerId} ${m.row.day}: ` +
        `${timeColumnLabel(m.row.openingTime)}–${timeColumnLabel(m.row.closingTime)}  →  ` +
        `${timeColumnLabel(m.migratedOpen)}–${timeColumnLabel(m.migratedClose)}${flag}`,
    );
    if (!reverse && m.divergences.length) {
      const sweep = m.divergences.length;
      log(`      ${sweep} sweep divergence(s); e.g. ${m.divergences
        .slice(0, 3)
        .map(
          (d) =>
            `@${Math.floor(d.probeSecondOfDay / 3600)}:${String(
              Math.floor((d.probeSecondOfDay % 3600) / 60),
            ).padStart(2, '0')} old=${d.old} new=${d.next}`,
        )
        .join(', ')}`);
    }
  }
}

async function readRows(
  prisma: PrismaClient,
  kind: ScheduleKind,
): Promise<ScheduleRow[]> {
  if (kind === 'store') {
    const rows = await prisma.storeSchedule.findMany({
      select: { id: true, branchId: true, day: true, openingTime: true, closingTime: true },
    });
    return rows.map((r) => ({
      id: r.id,
      ownerId: r.branchId,
      day: r.day as unknown as string,
      openingTime: r.openingTime,
      closingTime: r.closingTime,
    }));
  }
  const rows = await prisma.deliverySchedule.findMany({
    select: { id: true, deliveryId: true, day: true, openingTime: true, closingTime: true },
  });
  return rows.map((r) => ({
    id: r.id,
    ownerId: r.deliveryId,
    day: r.day as unknown as string,
    openingTime: r.openingTime,
    closingTime: r.closingTime,
  }));
}

async function applyMigrations(
  prisma: PrismaClient,
  kind: ScheduleKind,
  migrations: RowMigration[],
) {
  await prisma.$transaction(
    migrations.map((m) => {
      const data = { openingTime: m.migratedOpen, closingTime: m.migratedClose };
      return kind === 'store'
        ? prisma.storeSchedule.update({ where: { id: m.row.id }, data })
        : prisma.deliverySchedule.update({ where: { id: m.row.id }, data });
    }),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cutover = args.at ?? new Date();
  const probes = buildProbeInstants(cutover, args.step);

  const sign = args.reverse ? -1 : 1;
  const storeOffset = sign * args.storeOffset;
  const deliveryOffset = sign * args.deliveryOffset;

  log('Timezone schedule migration (Option A)');
  log(`  mode:           ${args.apply ? 'APPLY' : 'DRY-RUN'}${args.reverse ? ' (reverse)' : ''}`);
  log(`  cutover instant: ${cutover.toISOString()}`);
  log(`  store offset:    ${storeOffset >= 0 ? '+' : ''}${storeOffset}h`);
  log(`  delivery offset: ${deliveryOffset >= 0 ? '+' : ''}${deliveryOffset}h`);
  log(`  sweep step:      ${args.step} min`);

  const prisma = new PrismaClient();
  try {
    const kinds: { kind: ScheduleKind; offset: number }[] = [
      { kind: 'store', offset: storeOffset },
      { kind: 'delivery', offset: deliveryOffset },
    ];

    let cutoverDivergent = 0;
    let sweepDivergent = 0;
    const byKind: Record<ScheduleKind, RowMigration[]> = { store: [], delivery: [] };

    for (const { kind, offset } of kinds) {
      const rows = await readRows(prisma, kind);
      const migrations = rows.map((row) =>
        evaluateRowMigration(row, kind, offset, cutover, probes),
      );
      byKind[kind] = migrations;
      dumpTable(kind, migrations, args.reverse);

      if (!args.reverse) {
        const c = migrations.filter((m) => m.cutoverDiverges).length;
        const s = migrations.filter((m) => m.divergences.length > 0).length;
        cutoverDivergent += c;
        sweepDivergent += s;
        log('');
        log(
          `  ${kind}: ${c} cutover-instant divergence(s), ${s} row(s) with sweep divergence(s).`,
        );
      }
    }

    log('');
    if (args.reverse) {
      log('Reverse mode: status-neutrality is not evaluated (rollback to prior values).');
    } else if (cutoverDivergent === 0) {
      log('STATUS-NEUTRAL ✓  — no row changes its open/online decision at the cutover instant.');
      if (sweepDivergent > 0) {
        log(
          `(Note: ${sweepDivergent} row(s) differ somewhere in the 24h sweep — expected where the ` +
            'old offsets were buggy; these are the intended corrections. Review the dumps above.)',
        );
      }
    } else {
      log(
        `STATUS NOT NEUTRAL ✗  — ${cutoverDivergent} row(s) flip at the cutover instant. ` +
          'Review and/or re-tune --store-offset / --delivery-offset before applying.',
      );
    }

    if (!args.apply) {
      log('');
      log('Dry-run only. Re-run with --apply to write (off-peak; snapshot first).');
      return;
    }

    if (!args.reverse && cutoverDivergent > 0 && !args.force) {
      log('');
      log('Refusing to --apply: cutover-instant divergence present. Use --force after review.');
      process.exitCode = 1;
      return;
    }

    for (const { kind } of kinds) {
      await applyMigrations(prisma, kind, byKind[kind]);
    }
    log('');
    log('Applied. Re-reading to confirm post-state:');
    for (const { kind } of kinds) {
      const rows = await readRows(prisma, kind);
      log('');
      log(`=== ${kind.toUpperCase()}SCHEDULE (after) ===`);
      for (const r of rows) {
        log(
          `  #${r.id} owner=${r.ownerId} ${r.day}: ` +
            `${timeColumnLabel(r.openingTime)}–${timeColumnLabel(r.closingTime)}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
