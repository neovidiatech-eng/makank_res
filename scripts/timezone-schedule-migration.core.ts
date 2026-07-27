/**
 * Pure, DB-free core for the one-time schedule TIME migration (Option A: stored TIME becomes
 * the literal Egypt wall-clock). Kept separate from the CLI so the shift math, the faithful
 * replicas of the OLD runtime decisions, and the status-neutrality check are unit-testable
 * without a database.
 *
 * Background (verified in the timezone remediation plan): before this change, schedule TIME
 * columns held a UTC time-of-day and each read path re-added a hardcoded offset
 * (store open-check +3, delivery availability cron effectively 0 / the delivery sync helper
 * +2). Option A shifts the stored value once so the new zero-offset reads reproduce the
 * intended schedule.
 *
 * IMPORTANT — a single fixed offset is approximate. The client→stored conversion baked in the
 * DST offset that was in effect *at row creation time* (+2 winter / +3 summer), which we can't
 * recover per row. So the right migration offset is data-dependent; that is exactly why this
 * runs as a dry-run first and the offsets are configurable. The new write path
 * (egyptInstantToTimeColumn) is the permanent fix for future rows.
 */

import {
  isWithinWindow,
  timeColumnToMinutes,
  timeColumnToSeconds,
  toEgyptParts,
} from 'src/globals/helpers/egypt-time.helper';

/** Default per-table shift (hours), per the approved plan. Tunable via CLI / dry-run. */
export const DEFAULT_OFFSET_HOURS = { store: 3, delivery: 2 } as const;

export type ScheduleKind = 'store' | 'delivery';

export interface ScheduleRow {
  id: number;
  /** owning branchId (store) or deliveryId (delivery) — for the audit dump. */
  ownerId: number;
  day: string;
  openingTime: Date;
  closingTime: Date;
}

const SECONDS_PER_DAY = 24 * 60 * 60;

/** "HH:mm:ss" label for a @db.Time value (read as its literal UTC time-of-day). */
export function timeColumnLabel(t: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}

/**
 * Shift a @db.Time value by `offsetHours`, wrapping mod 24h and preserving seconds. Returns a
 * fresh epoch-based Date whose UTC time-of-day is the shifted value (so Prisma stores it back
 * as that literal TIME).
 */
export function shiftTimeColumn(t: Date, offsetHours: number): Date {
  const secs = timeColumnToSeconds(t);
  const shifted = (secs + offsetHours * 3600 + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const d = new Date(0);
  d.setUTCHours(
    Math.floor(shifted / 3600),
    Math.floor((shifted % 3600) / 60),
    shifted % 60,
    0,
  );
  return d;
}

// ---------------------------------------------------------------------------
// Faithful replicas of the OLD runtime open/online decisions (warts and all),
// so the status-neutral check compares NEW behavior against what production did.
// ---------------------------------------------------------------------------

/**
 * OLD store open-check — `ScheduleHelpersService.syncBranchOpenStatus`: stored time + 3h
 * (NON-wrapping, as in production), compared against the Egypt current minutes-of-day.
 */
export function oldStoreOpen(op: Date, cl: Date, egyptNowMinutes: number): boolean {
  const openingMinutes = (op.getUTCHours() + 3) * 60 + op.getUTCMinutes();
  const closingMinutes = (cl.getUTCHours() + 3) * 60 + cl.getUTCMinutes();
  if (closingMinutes < openingMinutes) {
    return egyptNowMinutes >= openingMinutes || egyptNowMinutes <= closingMinutes;
  }
  return egyptNowMinutes >= openingMinutes && egyptNowMinutes <= closingMinutes;
}

/**
 * OLD delivery online-check — the authoritative state-setter was the every-5-min cron
 * (`DeliveryAvailabilityService.checkAvailability`), which used server-local `getHours()`
 * (= UTC on the production container) with ZERO offset on the stored time. So: the stored UTC
 * seconds-of-day compared against the UTC current seconds-of-day, overnight-aware.
 */
export function oldDeliveryOnline(op: Date, cl: Date, utcNowSeconds: number): boolean {
  return isWithinWindow(
    timeColumnToSeconds(op),
    timeColumnToSeconds(cl),
    utcNowSeconds,
  );
}

/** NEW open/online (post-migration): zero-offset Egypt wall-clock comparison (Option A). */
export function newWindowOpen(
  migratedOpen: Date,
  migratedClose: Date,
  egyptNowMinutes: number,
): boolean {
  return isWithinWindow(
    timeColumnToMinutes(migratedOpen),
    timeColumnToMinutes(migratedClose),
    egyptNowMinutes,
  );
}

// ---------------------------------------------------------------------------
// Status-neutrality evaluation
// ---------------------------------------------------------------------------

export interface ProbeDivergence {
  rowId: number;
  /** seconds-of-day (UTC) of the probe within the cutover day. */
  probeSecondOfDay: number;
  old: boolean;
  next: boolean;
}

export interface RowMigration {
  row: ScheduleRow;
  kind: ScheduleKind;
  offsetHours: number;
  migratedOpen: Date;
  migratedClose: Date;
  /** Divergences across the 24h sweep (includes the cutover probe). */
  divergences: ProbeDivergence[];
  /** True if the cutover instant itself diverges (the hard apply gate). */
  cutoverDiverges: boolean;
}

/**
 * Build a sweep of probe instants across the Cairo day containing `cutover`, every
 * `stepMinutes` minutes, plus the exact cutover instant. Returns absolute Date instants.
 */
export function buildProbeInstants(cutover: Date, stepMinutes = 15): Date[] {
  const probes: Date[] = [cutover];
  // Anchor to Cairo midnight of the cutover day, then step forward 24h.
  const parts = toEgyptParts(cutover);
  const cairoMidnight = new Date(cutover.getTime() - parts.secondsOfDay * 1000);
  for (let m = 0; m < 24 * 60; m += stepMinutes) {
    probes.push(new Date(cairoMidnight.getTime() + m * 60 * 1000));
  }
  return probes;
}

/**
 * Evaluate one row's migration and status-neutrality.
 *
 * For each probe instant we compute the OLD decision (its own now-basis: store uses the Egypt
 * minutes; delivery uses the UTC seconds — matching the respective old code) and the NEW
 * decision (migrated value + DST-correct Egypt now). Any mismatch is recorded; a mismatch at
 * `cutover` flips `cutoverDiverges` (the hard gate for --apply).
 */
export function evaluateRowMigration(
  row: ScheduleRow,
  kind: ScheduleKind,
  offsetHours: number,
  cutover: Date,
  probes: Date[],
): RowMigration {
  const migratedOpen = shiftTimeColumn(row.openingTime, offsetHours);
  const migratedClose = shiftTimeColumn(row.closingTime, offsetHours);

  const divergences: ProbeDivergence[] = [];
  let cutoverDiverges = false;

  for (const probe of probes) {
    const egypt = toEgyptParts(probe);
    const utcSeconds =
      probe.getUTCHours() * 3600 + probe.getUTCMinutes() * 60 + probe.getUTCSeconds();

    const old =
      kind === 'store'
        ? oldStoreOpen(row.openingTime, row.closingTime, egypt.minutesOfDay)
        : oldDeliveryOnline(row.openingTime, row.closingTime, utcSeconds);

    const next = newWindowOpen(migratedOpen, migratedClose, egypt.minutesOfDay);

    if (old !== next) {
      divergences.push({
        rowId: row.id,
        probeSecondOfDay: egypt.secondsOfDay,
        old,
        next,
      });
      if (probe.getTime() === cutover.getTime()) cutoverDiverges = true;
    }
  }

  return { row, kind, offsetHours, migratedOpen, migratedClose, divergences, cutoverDiverges };
}
