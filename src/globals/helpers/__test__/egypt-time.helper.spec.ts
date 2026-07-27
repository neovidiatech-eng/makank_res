import { Days } from '@prisma/client';
import {
  EGYPT_TIME_ZONE,
  assertEgyptTimeZoneAvailable,
  egyptInstantToTimeColumn,
  egyptNowParts,
  egyptWallClockToMinutes,
  egyptWallClockToTimeColumn,
  formatEgypt,
  isBranchOpenBySchedule,
  isWithinWindow,
  timeColumnToHHmm,
  timeColumnToMinutes,
  timeColumnToSeconds,
  toEgyptParts,
} from 'src/globals/helpers/egypt-time.helper';

/**
 * Egypt (Africa/Cairo) time helper — the single source of truth for shift / store-hours
 * rules. These tests pin DST-correctness (UTC+2 winter / UTC+3 summer, reinstated 2023),
 * the overnight-window semantics, and the Option-A storage round-trip (stored TIME = literal
 * Cairo wall-clock). All expected wall-clock values were verified against Node's ICU.
 *
 * The assertions never depend on the machine's local timezone: `toEgyptParts` always pins
 * `timeZone: 'Africa/Cairo'`. Only "now"-based helpers freeze the system clock.
 */
describe('egypt-time.helper', () => {
  describe('assertEgyptTimeZoneAvailable', () => {
    it('resolves Africa/Cairo on a full-ICU runtime (does not throw)', () => {
      expect(() => assertEgyptTimeZoneAvailable()).not.toThrow();
      expect(EGYPT_TIME_ZONE).toBe('Africa/Cairo');
    });
  });

  describe('toEgyptParts — DST-correct wall-clock', () => {
    it('winter instant is UTC+2 (07:00Z → 09:00 Wed)', () => {
      const p = toEgyptParts(new Date('2025-01-15T07:00:00.000Z'));
      expect(p.hours).toBe(9);
      expect(p.minutes).toBe(0);
      expect(p.dayOfWeek).toBe(Days.WEDNESDAY);
      expect(p.dayIndex).toBe(3);
      expect(p.minutesOfDay).toBe(9 * 60);
      expect(p.secondsOfDay).toBe(9 * 3600);
    });

    it('summer instant is UTC+3 (06:00Z → 09:00 Tue)', () => {
      const p = toEgyptParts(new Date('2025-07-15T06:00:00.000Z'));
      expect(p.hours).toBe(9);
      expect(p.minutes).toBe(0);
      expect(p.dayOfWeek).toBe(Days.TUESDAY);
      expect(p.dayIndex).toBe(2);
    });

    it('rolls the day over near midnight in winter (22:30Z → 00:30 next-day Thu)', () => {
      const p = toEgyptParts(new Date('2025-01-15T22:30:00.000Z'));
      expect(p.hours).toBe(0);
      expect(p.minutes).toBe(30);
      expect(p.dayOfWeek).toBe(Days.THURSDAY);
      expect(p.minutesOfDay).toBe(30);
    });

    it('rolls the day over near midnight in summer (21:30Z → 00:30 next-day Wed)', () => {
      const p = toEgyptParts(new Date('2025-07-15T21:30:00.000Z'));
      expect(p.hours).toBe(0);
      expect(p.minutes).toBe(30);
      expect(p.dayOfWeek).toBe(Days.WEDNESDAY);
    });

    it('handles DST spring-forward day (2025-04-25, +3 after the jump → 13:00 Fri)', () => {
      const p = toEgyptParts(new Date('2025-04-25T10:00:00.000Z'));
      expect(p.hours).toBe(13);
      expect(p.dayOfWeek).toBe(Days.FRIDAY);
    });

    it('handles DST fall-back day (2025-10-31, +2 after the jump → 14:00 Fri)', () => {
      const p = toEgyptParts(new Date('2025-10-31T12:00:00.000Z'));
      expect(p.hours).toBe(14);
      expect(p.dayOfWeek).toBe(Days.FRIDAY);
    });

    it('uses +2 just before spring-forward and +2 just after fall-back', () => {
      expect(toEgyptParts(new Date('2025-04-24T20:00:00.000Z')).hours).toBe(22); // +2
      expect(toEgyptParts(new Date('2025-11-02T09:00:00.000Z')).hours).toBe(11); // +2
    });
  });

  describe('egyptNowParts — frozen clock', () => {
    afterEach(() => jest.useRealTimers());

    it('reflects the Cairo wall-clock for the frozen instant', () => {
      jest.useFakeTimers().setSystemTime(new Date('2025-07-15T06:00:00.000Z'));
      const p = egyptNowParts();
      expect(p.hours).toBe(9);
      expect(p.dayOfWeek).toBe(Days.TUESDAY);
    });
  });

  describe('isWithinWindow — inclusive, overnight-aware', () => {
    // 09:00–17:00 in minutes-of-day
    const open = 9 * 60;
    const close = 17 * 60;

    it('inside the window', () => {
      expect(isWithinWindow(open, close, 12 * 60)).toBe(true);
    });
    it('inclusive at both boundaries', () => {
      expect(isWithinWindow(open, close, open)).toBe(true);
      expect(isWithinWindow(open, close, close)).toBe(true);
    });
    it('outside the window', () => {
      expect(isWithinWindow(open, close, 8 * 60 + 59)).toBe(false);
      expect(isWithinWindow(open, close, 17 * 60 + 1)).toBe(false);
    });

    describe('overnight 22:00 → 04:00', () => {
      const o = 22 * 60;
      const c = 4 * 60;
      it('23:00 is inside', () =>
        expect(isWithinWindow(o, c, 23 * 60)).toBe(true));
      it('03:00 is inside', () =>
        expect(isWithinWindow(o, c, 3 * 60)).toBe(true));
      it('12:00 is outside', () =>
        expect(isWithinWindow(o, c, 12 * 60)).toBe(false));
    });

    it('treats an empty window (open === close) as CLOSED, not open-24h', () => {
      expect(isWithinWindow(9 * 60, 9 * 60, 9 * 60)).toBe(false);
      expect(isWithinWindow(9 * 60, 9 * 60, 12 * 60)).toBe(false);
    });

    it('is unit-agnostic (works in seconds-of-day too)', () => {
      expect(isWithinWindow(9 * 3600, 17 * 3600, 12 * 3600)).toBe(true);
      expect(isWithinWindow(9 * 3600, 17 * 3600, 8 * 3600)).toBe(false);
    });
  });

  describe('time-column conversions (Option A: stored value is literal wall-clock)', () => {
    it('timeColumnToMinutes reads the stored UTC time-of-day with zero offset', () => {
      const t = egyptWallClockToTimeColumn(9, 30);
      expect(timeColumnToMinutes(t)).toBe(9 * 60 + 30);
    });

    it('timeColumnToSeconds reads seconds-of-day', () => {
      const t = egyptWallClockToTimeColumn(9, 30);
      expect(timeColumnToSeconds(t)).toBe(9 * 3600 + 30 * 60);
    });

    it('egyptWallClockToTimeColumn ↔ timeColumnToMinutes round-trips (numeric & HH:mm)', () => {
      for (const [h, m] of [
        [0, 0],
        [9, 0],
        [13, 45],
        [23, 59],
      ]) {
        expect(timeColumnToMinutes(egyptWallClockToTimeColumn(h, m))).toBe(
          h * 60 + m,
        );
      }
      expect(timeColumnToMinutes(egyptWallClockToTimeColumn('14:30'))).toBe(
        14 * 60 + 30,
      );
    });

    it('persists into the UTC time-of-day so MySQL TIME reads back literally', () => {
      const t = egyptWallClockToTimeColumn(9, 0);
      expect(t.getUTCHours()).toBe(9);
      expect(t.getUTCMinutes()).toBe(0);
    });
  });

  // NOTE: schedule writes now take an "HH:mm" wall-clock directly (egyptWallClockToTimeColumn);
  // egyptInstantToTimeColumn remains as a general instant → Cairo-wall-clock converter and is
  // pinned here for any caller that still has an absolute instant in hand.
  describe('egyptInstantToTimeColumn — instant → literal Cairo TIME', () => {
    it('summer 06:00Z (= 09:00 Cairo) is stored as 09:00', () => {
      const t = egyptInstantToTimeColumn(new Date('2025-07-15T06:00:00.000Z'));
      expect(timeColumnToMinutes(t)).toBe(9 * 60);
    });

    it('winter 07:00Z (= 09:00 Cairo) is stored as 09:00 (same TIME despite DST)', () => {
      const t = egyptInstantToTimeColumn(new Date('2025-01-15T07:00:00.000Z'));
      expect(timeColumnToMinutes(t)).toBe(9 * 60);
    });

    // Regression guard for the documented contract: the schedule DTO value is a TRUE INSTANT,
    // so we convert it to Cairo wall-clock. If a future change instead treats the picked
    // wall-clock as already-Cairo stamped 'Z' (e.g. 09:00:00Z meaning 09:00 Cairo), this
    // assertion fails loudly — forcing the wire-contract decision to be revisited explicitly.
    it('treats the instant as absolute (09:00Z in summer → 12:00 Cairo, NOT 09:00)', () => {
      const t = egyptInstantToTimeColumn(new Date('2025-07-15T09:00:00.000Z'));
      expect(timeColumnToMinutes(t)).toBe(12 * 60);
      expect(timeColumnToMinutes(t)).not.toBe(9 * 60);
    });
  });

  describe('formatEgypt', () => {
    it('renders a Cairo HH:mm label by default', () => {
      // 06:00Z in summer = 09:00 Cairo
      expect(formatEgypt(new Date('2025-07-15T06:00:00.000Z'))).toBe('09:00');
    });
  });

  describe('timeColumnToHHmm — read-side "HH:mm" (zero offset, the response contract)', () => {
    it('renders a stored TIME as zero-padded 24-hour "HH:mm"', () => {
      expect(timeColumnToHHmm(egyptWallClockToTimeColumn(9, 0))).toBe('09:00');
      expect(timeColumnToHHmm(egyptWallClockToTimeColumn(17, 30))).toBe(
        '17:30',
      );
      expect(timeColumnToHHmm(egyptWallClockToTimeColumn(0, 5))).toBe('00:05');
      expect(timeColumnToHHmm(egyptWallClockToTimeColumn(22, 15))).toBe(
        '22:15',
      );
    });

    it('round-trips with egyptWallClockToTimeColumn("HH:mm")', () => {
      for (const hhmm of ['00:00', '09:00', '13:45', '23:59']) {
        expect(timeColumnToHHmm(egyptWallClockToTimeColumn(hhmm))).toBe(hhmm);
      }
    });
  });

  describe('egyptWallClockToMinutes — write/validation minutes-of-day from "HH:mm"', () => {
    it('parses "HH:mm" to minutes-of-day', () => {
      expect(egyptWallClockToMinutes('00:00')).toBe(0);
      expect(egyptWallClockToMinutes('09:00')).toBe(540);
      expect(egyptWallClockToMinutes('17:30')).toBe(1050);
      expect(egyptWallClockToMinutes('23:59')).toBe(1439);
    });

    it('agrees with timeColumnToMinutes for the same wall-clock (one shared basis)', () => {
      for (const hhmm of ['09:00', '22:15', '00:05']) {
        expect(egyptWallClockToMinutes(hhmm)).toBe(
          timeColumnToMinutes(egyptWallClockToTimeColumn(hhmm)),
        );
      }
    });
  });

  describe('isBranchOpenBySchedule — same-day-only lookups silently dropped overnight windows', () => {
    const row = (day: Days, open: string, close: string) => ({
      day,
      openingTime: egyptWallClockToTimeColumn(open),
      closingTime: egyptWallClockToTimeColumn(close),
    });
    const nowAt = (dayOfWeek: Days, dayIndex: number, hhmm: string) => ({
      dayOfWeek,
      dayIndex,
      hours: 0,
      minutes: 0,
      seconds: 0,
      minutesOfDay: egyptWallClockToMinutes(hhmm),
      secondsOfDay: 0,
    });

    it('is open during a normal same-day window', () => {
      const schedules = [row(Days.SUNDAY, '09:00', '17:00')];
      expect(
        isBranchOpenBySchedule(schedules, nowAt(Days.SUNDAY, 0, '10:00')),
      ).toBe(true);
      expect(
        isBranchOpenBySchedule(schedules, nowAt(Days.SUNDAY, 0, '18:00')),
      ).toBe(false);
    });

    it('stays open past midnight for an overnight window posted the day before (the bug this fixes)', () => {
      // Friday 20:00 -> Saturday 02:00, checked at 01:00 on Saturday.
      const schedules = [row(Days.FRIDAY, '20:00', '02:00')];
      expect(
        isBranchOpenBySchedule(schedules, nowAt(Days.SATURDAY, 6, '01:00')),
      ).toBe(true);
    });

    it('does not let a non-overnight window from yesterday bleed into today', () => {
      // Thursday 09:00 -> 17:00 (NOT overnight) must never count as "open" on Friday,
      // even though 10:00 falls inside the same clock-time range.
      const schedules = [row(Days.THURSDAY, '09:00', '17:00')];
      expect(
        isBranchOpenBySchedule(schedules, nowAt(Days.FRIDAY, 5, '10:00')),
      ).toBe(false);
    });

    it('is genuinely closed well after an overnight window from yesterday ends', () => {
      const schedules = [row(Days.FRIDAY, '20:00', '02:00')];
      expect(
        isBranchOpenBySchedule(schedules, nowAt(Days.SATURDAY, 6, '10:00')),
      ).toBe(false);
    });

    it('still works when both today and yesterday rows are present', () => {
      const schedules = [
        row(Days.FRIDAY, '20:00', '02:00'),
        row(Days.SATURDAY, '09:00', '17:00'),
      ];
      expect(
        isBranchOpenBySchedule(schedules, nowAt(Days.SATURDAY, 6, '01:00')),
      ).toBe(true); // via Friday's overnight tail
      expect(
        isBranchOpenBySchedule(schedules, nowAt(Days.SATURDAY, 6, '12:00')),
      ).toBe(true); // via Saturday's own window
      expect(
        isBranchOpenBySchedule(schedules, nowAt(Days.SATURDAY, 6, '19:00')),
      ).toBe(false);
    });
  });
});
