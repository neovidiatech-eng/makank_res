import { egyptWallClockToTimeColumn } from 'src/globals/helpers/egypt-time.helper';
import {
  ScheduleRow,
  buildProbeInstants,
  evaluateRowMigration,
  oldDeliveryOnline,
  oldStoreOpen,
  shiftTimeColumn,
  timeColumnLabel,
} from '../timezone-schedule-migration.core';

/** Build a @db.Time value (epoch date, UTC time-of-day = the given wall-clock). */
const mk = (h: number, m = 0, s = 0): Date => {
  const d = new Date(0);
  d.setUTCHours(h, m, s, 0);
  return d;
};

const row = (openingTime: Date, closingTime: Date): ScheduleRow => ({
  id: 1,
  ownerId: 99,
  day: 'TUESDAY',
  openingTime,
  closingTime,
});

describe('timezone-schedule-migration core', () => {
  describe('shiftTimeColumn — wrap mod 24h, preserve seconds', () => {
    it('23:30 +3h → 02:30', () => {
      expect(timeColumnLabel(shiftTimeColumn(mk(23, 30), 3))).toBe('02:30:00');
    });
    it('22:15 +2h → 00:15', () => {
      expect(timeColumnLabel(shiftTimeColumn(mk(22, 15), 2))).toBe('00:15:00');
    });
    it('preserves seconds', () => {
      expect(timeColumnLabel(shiftTimeColumn(mk(23, 30, 45), 1))).toBe('00:30:45');
    });
    it('reverse (negative offset) restores the original', () => {
      const original = mk(6, 0, 12);
      const forward = shiftTimeColumn(original, 3);
      expect(timeColumnLabel(shiftTimeColumn(forward, -3))).toBe('06:00:12');
    });
  });

  describe('OLD decision replicas', () => {
    it('oldStoreOpen applies +3 and is inclusive (06:00–14:00 → open at 12:00 Cairo)', () => {
      // stored 06:00–14:00 → +3 window 09:00–17:00; 12:00 (720m) is inside.
      expect(oldStoreOpen(mk(6), mk(14), 12 * 60)).toBe(true);
      expect(oldStoreOpen(mk(6), mk(14), 8 * 60)).toBe(false);
    });
    it('oldDeliveryOnline is zero-offset on the stored UTC time (the cron basis)', () => {
      // stored 06:00–14:00 compared to UTC now; 09:00 UTC inside, 05:00 UTC outside.
      expect(oldDeliveryOnline(mk(6), mk(14), 9 * 3600)).toBe(true);
      expect(oldDeliveryOnline(mk(6), mk(14), 5 * 3600)).toBe(false);
    });
  });

  describe('buildProbeInstants', () => {
    it('includes the cutover plus a 24h/step sweep', () => {
      const cutover = new Date('2025-07-15T09:00:00.000Z');
      const probes = buildProbeInstants(cutover, 15);
      expect(probes[0].getTime()).toBe(cutover.getTime());
      expect(probes.length).toBe(1 + (24 * 60) / 15); // 1 + 96
    });
  });

  describe('status-neutrality (summer cutover 2025-07-15T09:00Z = Cairo 12:00 Tue)', () => {
    const cutover = new Date('2025-07-15T09:00:00.000Z');
    const probes = buildProbeInstants(cutover, 15);

    it('STORE +3 on a 06:00–14:00 row is fully status-neutral', () => {
      const m = evaluateRowMigration(row(mk(6), mk(14)), 'store', 3, cutover, probes);
      expect(timeColumnLabel(m.migratedOpen)).toBe('09:00:00');
      expect(timeColumnLabel(m.migratedClose)).toBe('17:00:00');
      expect(m.cutoverDiverges).toBe(false);
      expect(m.divergences).toHaveLength(0);
    });

    // FINDING: the dominant delivery state-setter is the every-5-min cron, which read the
    // stored time with ZERO offset (server-local getHours() == UTC in prod). Migrating
    // delivery by +2 (the plan default, matching the *secondary* sync helper) therefore
    // leaves a 1h boundary disagreement vs the cron — invisible at a midday cutover but
    // surfaced by the sweep. Migrating by +3 (the current Cairo offset) is cron-neutral.
    it('DELIVERY +2 is neutral at the midday cutover but DIVERGES in the sweep', () => {
      const m = evaluateRowMigration(row(mk(6), mk(14)), 'delivery', 2, cutover, probes);
      expect(m.cutoverDiverges).toBe(false);
      expect(m.divergences.length).toBeGreaterThan(0);
    });

    it('DELIVERY +3 is fully status-neutral against the cron', () => {
      const m = evaluateRowMigration(row(mk(6), mk(14)), 'delivery', 3, cutover, probes);
      expect(m.cutoverDiverges).toBe(false);
      expect(m.divergences).toHaveLength(0);
    });

    it('flags a cutover-instant divergence when the offset is plainly wrong', () => {
      // Migrating store by 0h leaves stored 06:00–14:00 read as 06:00–14:00 Cairo, but the
      // OLD store check used +3 (09:00–17:00). At Cairo 12:00 both are open, so use a row
      // whose mismatch lands on the cutover: stored 09:00–17:00 with offset 0 → NEW open
      // 09:00–17:00, OLD open (with +3) 12:00–20:00; at Cairo 10:00 they differ.
      const at = new Date('2025-07-15T07:00:00.000Z'); // Cairo 10:00
      const m = evaluateRowMigration(
        row(mk(9), mk(17)),
        'store',
        0,
        at,
        buildProbeInstants(at, 15),
      );
      expect(m.cutoverDiverges).toBe(true);
    });
  });
});
