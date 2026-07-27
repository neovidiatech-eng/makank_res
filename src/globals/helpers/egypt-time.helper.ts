import { Days } from '@prisma/client';

/**
 * Single source of truth for Egypt (Africa/Cairo) time-of-day business rules:
 * driver shifts, store/branch opening hours and shift reminders.
 *
 * Egypt observes seasonal DST again since 2023 (UTC+2 winter / UTC+3 summer), so a
 * hardcoded +2/+3 offset is wrong twice a year, and any rule based on the server's local
 * clock is wrong whenever the container is not on Cairo time (it runs UTC). Every function
 * here derives the Cairo wall-clock from the *instant* via `Intl.DateTimeFormat`, which
 * resolves the correct offset per-instant — correctness no longer depends on the season or
 * the server timezone.
 *
 * Storage convention (Option A): schedule `@db.Time(0)` columns store the **literal Egypt
 * wall-clock**. The schedule API uses a plain `"HH:mm"` contract: writes persist it verbatim via
 * `egyptWallClockToTimeColumn(hhmm)`, reads compare with ZERO offset (`timeColumnToMinutes` /
 * `timeColumnToSeconds`) and serialize back via `timeColumnToHHmm`. (`egyptInstantToTimeColumn`
 * remains a general instant → wall-clock converter for callers holding an absolute instant.)
 */

export const EGYPT_TIME_ZONE = 'Africa/Cairo';

export interface EgyptParts {
  /** Prisma `Days` enum for the Cairo calendar day of the instant. */
  dayOfWeek: Days;
  /** 0=Sunday … 6=Saturday — matches `Date.getDay()` and `WEEK_DAYS` ordering. */
  dayIndex: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** `hours * 60 + minutes` */
  minutesOfDay: number;
  /** `hours * 3600 + minutes * 60 + seconds` */
  secondsOfDay: number;
}

// 0=Sunday … 6=Saturday — mirrors Date.getDay() and DeliveryAvailabilityService.WEEK_DAYS.
export const WEEK_DAYS: readonly Days[] = Object.freeze([
  Days.SUNDAY,
  Days.MONDAY,
  Days.TUESDAY,
  Days.WEDNESDAY,
  Days.THURSDAY,
  Days.FRIDAY,
  Days.SATURDAY,
]);

// Intl emits English weekday long-names (locale 'en-GB'); map them back to WEEK_DAYS.
const WEEKDAY_NAME_TO_INDEX: Readonly<Record<string, number>> = Object.freeze({
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
});

const cairoFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: EGYPT_TIME_ZONE,
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * Fails fast if the runtime cannot resolve `Africa/Cairo` (e.g. a `small-icu` Node build),
 * in which case `Intl` silently falls back to UTC and every rule below would be wrong.
 * Call once at boot.
 */
export function assertEgyptTimeZoneAvailable(): void {
  const resolved = cairoFormatter.resolvedOptions().timeZone;
  if (resolved !== EGYPT_TIME_ZONE) {
    throw new Error(
      `ICU/timezone data unavailable: requested ${EGYPT_TIME_ZONE} but resolved to ` +
        `${resolved}. Ship a full-ICU Node build so Egypt time can be resolved.`,
    );
  }
}

/** Decompose an absolute instant into DST-correct Cairo wall-clock parts. */
export function toEgyptParts(date: Date = new Date()): EgyptParts {
  const parts = cairoFormatter.formatToParts(date);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let weekday = '';

  for (const p of parts) {
    switch (p.type) {
      case 'hour':
        // en-GB + hour12:false can render midnight as '24'; normalize to 0.
        hours = p.value === '24' ? 0 : Number(p.value);
        break;
      case 'minute':
        minutes = Number(p.value);
        break;
      case 'second':
        seconds = Number(p.value);
        break;
      case 'weekday':
        weekday = p.value;
        break;
    }
  }

  const dayIndex = WEEKDAY_NAME_TO_INDEX[weekday];
  return {
    dayOfWeek: WEEK_DAYS[dayIndex],
    dayIndex,
    hours,
    minutes,
    seconds,
    minutesOfDay: hours * 60 + minutes,
    secondsOfDay: hours * 3600 + minutes * 60 + seconds,
  };
}

/** Cairo wall-clock parts for "now". */
export function egyptNowParts(): EgyptParts {
  return toEgyptParts(new Date());
}

// en-CA is the standard Intl trick for a YYYY-MM-DD render.
const cairoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: EGYPT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Cairo calendar date ("YYYY-MM-DD") for an instant — for bucketing/grouping
 * by "day" in business terms (e.g. sales-per-day), where the server's own
 * UTC calendar day would split/merge days incorrectly around the Cairo
 * midnight boundary.
 */
export function toEgyptDateKey(date: Date = new Date()): string {
  return cairoDateFormatter.format(date);
}

/**
 * True if `now` falls within `[open, close]`, inclusive of both ends, handling an overnight
 * window where `close < open` (e.g. 22:00 → 04:00). An empty window (`open === close`) is
 * treated as **closed** rather than open-24h. Unit-agnostic: pass all three in the same unit
 * (minutes-of-day or seconds-of-day).
 */
export function isWithinWindow(
  open: number,
  close: number,
  now: number,
): boolean {
  if (open === close) return false;
  if (open < close) {
    return now >= open && now <= close;
  }
  // Overnight wrap.
  return now >= open || now <= close;
}

/**
 * Minutes-of-day held in a `@db.Time` column. Under Option A the column stores the literal
 * Egypt wall-clock (persisted via `egyptWallClockToTimeColumn`, i.e. `setUTCHours`), so we
 * read it back with `getUTC*` and add ZERO offset.
 */
export function timeColumnToMinutes(t: Date): number {
  const d = t instanceof Date ? t : new Date(t);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Is a branch open right now given its weekly schedule rows? Handles the
 * case a same-day-only lookup misses entirely: an overnight window (e.g.
 * Friday 20:00 → 02:00) posted under Friday is still legitimately "open" at
 * 01:00 on *Saturday*, but a naive `WHERE day = today` never fetches the
 * Friday row once the calendar date has rolled over — so a branch open past
 * midnight would incorrectly compute as closed right after 00:00. This
 * checks today's rows normally, plus yesterday's row ONLY when it's a real
 * overnight window (closingTime < openingTime) — a non-overnight window
 * from yesterday must never bleed into today's open/closed answer.
 */
export function isBranchOpenBySchedule(
  schedules: { day: Days; openingTime: Date; closingTime: Date }[],
  now: EgyptParts = egyptNowParts(),
): boolean {
  const currentMinutes = now.minutesOfDay;
  const yesterday = WEEK_DAYS[(now.dayIndex + 6) % 7];

  return schedules.some((schedule) => {
    const openMinutes = timeColumnToMinutes(schedule.openingTime);
    const closeMinutes = timeColumnToMinutes(schedule.closingTime);

    if (schedule.day === now.dayOfWeek) {
      return isWithinWindow(openMinutes, closeMinutes, currentMinutes);
    }
    if (schedule.day === yesterday && closeMinutes < openMinutes) {
      return isWithinWindow(openMinutes, closeMinutes, currentMinutes);
    }
    return false;
  });
}

/** Seconds-of-day counterpart to `timeColumnToMinutes`. */
export function timeColumnToSeconds(t: Date): number {
  const d = t instanceof Date ? t : new Date(t);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

/**
 * Build the `Date` to persist into a `@db.Time` column so its **UTC** time-of-day equals the
 * given Egypt wall-clock. Prisma maps a JS `Date` to MySQL `TIME` by its UTC time-of-day, so
 * `setUTCHours(h, m)` makes the stored value read back as exactly `h:m` (Option A).
 *
 * Accepts numeric `(hours, minutes)` or a single `"HH:mm"` string.
 */
export function egyptWallClockToTimeColumn(
  hours: number,
  minutes?: number,
): Date;
export function egyptWallClockToTimeColumn(hhmm: string): Date;
export function egyptWallClockToTimeColumn(
  hoursOrHHmm: number | string,
  minutes = 0,
): Date {
  let h: number;
  let m: number;
  if (typeof hoursOrHHmm === 'string') {
    const [hh, mm] = hoursOrHHmm.split(':');
    h = Number(hh);
    m = Number(mm);
  } else {
    h = hoursOrHHmm;
    m = minutes;
  }
  const d = new Date(0); // 1970-01-01T00:00:00.000Z
  d.setUTCHours(h, m, 0, 0);
  return d;
}

/**
 * Extract the intended Egypt wall-clock from a client-supplied **instant** and return the
 * `Date` to persist into a `@db.Time` column (Option A write path). The schedule DTOs arrive
 * as ISO instants (see the timezone remediation plan / DTO `@ValidateDate`), so we convert
 * the instant to Cairo parts and store that literal wall-clock — DST-correct and offset-free.
 */
export function egyptInstantToTimeColumn(instant: Date): Date {
  const { hours, minutes } = toEgyptParts(instant);
  return egyptWallClockToTimeColumn(hours, minutes);
}

/**
 * Render a `@db.Time` column as a `"HH:mm"` wall-clock string (zero-padded, 24-hour). Reads
 * with `getUTC*` and ZERO offset (Option A: the stored value is the literal Egypt wall-clock).
 * This is the read-side counterpart to `egyptWallClockToTimeColumn` — schedule responses expose
 * `openingTime`/`closingTime` as `"09:00"`, not a serialized `1970-…Z` instant.
 */
export function timeColumnToHHmm(t: Date): string {
  const d = t instanceof Date ? t : new Date(t);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Minutes-of-day for a `"HH:mm"` wall-clock string — the write/validation counterpart to
 * `timeColumnToMinutes` (which reads a `@db.Time` column). Used by schedule-overlap validators
 * to compare an incoming `HH:mm` against the stored rows on one shared (zero-offset) basis.
 */
export function egyptWallClockToMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(':');
  return Number(hh) * 60 + Number(mm);
}

/**
 * Cairo-localized label (default `HH:mm`, 24-hour) for user-facing strings such as break or
 * shift messages. Pass `options` to override the rendered fields.
 */
export function formatEgypt(
  date: Date,
  options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  },
): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: EGYPT_TIME_ZONE,
    ...options,
  }).format(date);
}
