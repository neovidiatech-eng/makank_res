# Timezone Handling — Egypt Wall-Clock Schedules

## Overview

Makanak runs time-of-day business rules for the **Egypt market** (Africa/Cairo): store/branch
opening hours, driver shift windows, and shift reminders. Egypt observes **seasonal DST again
since 2023** — UTC+2 in winter, UTC+3 in summer — so any rule built on a hardcoded `+2`/`+3`
offset is wrong twice a year, and any rule built on the container's local clock is wrong whenever
the container is not on Cairo time (it runs **UTC**, and must stay UTC).

This document describes the rule that fixes that, the helper that enforces it, and what backend,
frontend, and DB are each responsible for. If you are wiring a schedule time picker, a store/branch
"open now" badge, or the driver check-in screen, use the companion
**[Frontend / mobile integration guide](./timezone-frontend-mobile-integration.md)**.

> **The rule (one sentence):** schedule `@db.Time` columns store the **literal Egypt
> (Africa/Cairo) wall-clock** time-of-day, and every read compares them against the **current
> Egypt wall-clock** with **zero offset**.

All time-of-day logic routes through a single helper:
**`src/globals/helpers/egypt-time.helper.ts`**. There are **no hardcoded offsets anywhere else**
— adding one is a bug (see [Why `+2`/`+3` is forbidden](#why-23-is-forbidden)).

---

## The rule in detail

### Storage convention — "Option A"

The two schedule tables hold time-of-day in MySQL `TIME(0)` columns:

| Model | Table | Time columns | Day column | Owner FK |
|---|---|---|---|---|
| `StoreSchedule` | `store_schedule` | `opening_time`, `closing_time` | `day` (`Days` enum) | `branch_id` |
| `DeliverySchedule` | `delivery_schedule` | `opening_time`, `closing_time` | `day` (`Days` enum) | `delivery_id` |

Under **Option A** the value stored in `opening_time` / `closing_time` **is** the Egypt
wall-clock the user picked. A branch that opens at **09:00 Cairo** stores `09:00:00`. A driver
shift that ends at **17:00 Cairo** stores `17:00:00`. No offset is baked in at write time, and no
offset is added at read time. Stored TIME = displayed TIME = compared TIME.

Why this works regardless of server timezone or DST: Prisma maps a JS `Date` to a MySQL `TIME`
column by the `Date`'s **UTC** time-of-day. So the write path builds a `Date` whose *UTC*
time-of-day equals the intended Cairo wall-clock (`setUTCHours`), and the read path reads it back
with `getUTC*`. Both sides use UTC accessors purely as a transport detail; the **meaning** of the
number is always "Egypt wall-clock". The DST offset never enters the stored value — it is only
ever applied (per-instant, by `Intl`) when converting **"now"** into Cairo parts for comparison.

### Why wall-clock, not a UTC time-of-day

The old design stored a *UTC* time-of-day and re-added a fixed offset on every read. That has two
fatal problems:

1. **DST.** A fixed `+2` (or `+3`) is correct for only half the year. Twice a year every
   store/shift silently shifts by an hour.
2. **Drift between read paths.** Different code paths used different offsets (store open-check
   `+3`, delivery sync `+2`, the cron effectively `0`), so the *same* schedule could be
   considered open by one path and closed by another.

Storing the literal wall-clock removes both: there is no offset to get wrong, and there is one
comparison rule shared by every path.

---

## Affected vs unaffected fields

**Affected (Option A wall-clock TIME — read with zero offset):**

- `StoreSchedule.openingTime`, `StoreSchedule.closingTime`
- `DeliverySchedule.openingTime`, `DeliverySchedule.closingTime`

**Unaffected (true absolute instants — leave them alone):**

- `createdAt` / `updatedAt` on every model.
- `Order.date`, `Order.createdAt`, and the day-range filters in driver dashboards/statistics
  (these use plain local-`Date` bounds against absolute instants and are out of scope here).
- `Branch.busyUntil`, `DeliveryDetails.lastLocationUpdate`, AFK `breakUntil`, attendance
  `checkInTime` — all absolute `DateTime` instants, compared with `new Date()`. They are **not**
  time-of-day columns and must not be run through the wall-clock helpers.

Rule of thumb: if the column is `@db.Time` it is a **wall-clock time-of-day** → use the helper.
If it is a `DateTime` instant → it is an absolute moment → compare with `new Date()`.

---

## How to compute "current Egypt time" in code

Never call `new Date().getHours()` (that is the server's local clock — UTC in prod). Always go
through the helper:

```ts
import { egyptNowParts } from 'src/globals/helpers/egypt-time.helper';

const np = egyptNowParts();
np.dayOfWeek;       // Days enum for the Cairo calendar day (handles midnight rollover)
np.minutesOfDay;    // hours*60 + minutes      — compare against timeColumnToMinutes()
np.secondsOfDay;    // hours*3600 + min*60 + s  — compare against timeColumnToSeconds()
```

`egyptNowParts()` is `toEgyptParts(new Date())`. `toEgyptParts(date)` decomposes **any** instant
into DST-correct Cairo parts via `Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', … })`,
which resolves the correct offset for that specific instant (UTC+2 winter / UTC+3 summer).

To get "Cairo now" from the shell for testing, see the
[manual test flow](./timezone-manual-test-flow.md#step-1-compute-cairo-now).

---

## The schedule comparison pattern

Every open/online check follows the same three-line shape:

```ts
import {
  egyptNowParts,
  isWithinWindow,
  timeColumnToMinutes,   // or timeColumnToSeconds
} from 'src/globals/helpers/egypt-time.helper';

const nowMinutes = egyptNowParts().minutesOfDay;          // Cairo "now" → minutes-of-day
const open  = timeColumnToMinutes(schedule.openingTime);  // stored TIME → minutes-of-day (zero offset)
const close = timeColumnToMinutes(schedule.closingTime);
const isOpen = isWithinWindow(open, close, nowMinutes);
```

`isWithinWindow(open, close, now)` semantics (all three in the **same unit**):

- **Inclusive** of both ends: `now === open` and `now === close` are both *inside*.
- **Overnight-aware:** if `close < open` (e.g. `22:00 → 02:00`) the window wraps past midnight, so
  it is satisfied when `now >= open` **or** `now <= close`.
- **Empty window** (`open === close`) is treated as **closed**, not open-24h.
- **Unit-agnostic:** pass all three as minutes-of-day or all three as seconds-of-day.

Minutes-of-day is enough for the open/closed checks (driver check-in, branch `isOpen`, store sync).
Seconds-of-day is used by the availability crons (`DeliveryAvailabilityService.isWithinShift`) so a
shift that ends at `17:00:00` is precise to the second.

---

## Helper API reference

`src/globals/helpers/egypt-time.helper.ts` — the single source of truth.

| Export | Purpose |
|---|---|
| `EGYPT_TIME_ZONE` | `'Africa/Cairo'`. |
| `assertEgyptTimeZoneAvailable()` | Boot guard — throws if the runtime can't resolve Africa/Cairo (e.g. a `small-icu` Node build where `Intl` silently falls back to UTC). Called in `main.ts`. |
| `toEgyptParts(date?)` | Decompose any instant into DST-correct Cairo parts (`dayOfWeek`, `dayIndex`, `hours`, `minutes`, `seconds`, `minutesOfDay`, `secondsOfDay`). |
| `egyptNowParts()` | `toEgyptParts(new Date())` — Cairo "now". |
| `isWithinWindow(open, close, now)` | Inclusive, overnight-aware, `open===close ⇒ closed`, unit-agnostic window test. |
| `timeColumnToMinutes(t)` | Read a stored `@db.Time` value as minutes-of-day, zero offset (`getUTC*`). |
| `timeColumnToSeconds(t)` | Same as seconds-of-day. |
| `timeColumnToHHmm(t)` | **Read contract.** Render a stored `@db.Time` value as `"HH:mm"` (zero offset) for API responses. |
| `egyptWallClockToTimeColumn(h, m)` / `(…"HH:mm")` | **Write path.** Build the `Date` to persist so its UTC time-of-day equals the given Cairo wall-clock (`setUTCHours`). Schedule writes pass the DTO `"HH:mm"` straight in. |
| `egyptWallClockToMinutes("HH:mm")` | Minutes-of-day from a `"HH:mm"` string — used by the overlap validators. |
| `egyptInstantToTimeColumn(instant)` | General converter: extract the Cairo wall-clock from an absolute instant, then persist it literally. (No longer used by the schedule write path — kept for callers holding a real instant.) |
| `formatEgypt(date, opts?)` | Cairo-localized label (default `HH:mm`, 24h) for user-facing strings (shift/break messages). |

---

## Backend / frontend / DB expectations

### Backend

- **Write path:** schedule create/update DTO fields are an Egypt wall-clock **`"HH:mm"`** string
  (`@ValidateTime`). The backend persists each verbatim via `egyptWallClockToTimeColumn(hhmm)` — no
  instant, no conversion. See `DeliveryService.createSchedule` / `updateSchedule` and
  `ScheduleService.createSchedule` / `updateSchedules`.
- **Validation (overlap / open<close):** `ScheduleHelpersService.scheduleOverlap` and
  `DeliveryScheduleHelpersService.scheduleOverlap` parse the incoming `"HH:mm"` with
  `egyptWallClockToMinutes` and compare on the same zero-offset basis the stored rows use, so
  validation and the runtime open-check agree (previously they disagreed, `+2` vs `+3`).
- **Read contract:** `ResponseService.localizeBody` runs a field-name-scoped pass
  (`stringifyScheduleTimes`) that rewrites every `openingTime` / `closingTime` `Date` to `"HH:mm"`
  via `timeColumnToHHmm`, on **all** responses (localized + raw), before the `+2h` localizer. So
  schedule fields are `"HH:mm"` everywhere; the `+2h` shift on other `Date` fields is untouched.
- **Read paths (all zero-offset, all via the helper):**
  - `BranchService.calculateIsOpen` — `isOpen` flag on branch responses.
  - `ScheduleHelpersService.syncBranchOpenStatus` — persists `Branch.closed`.
  - `DeliveryAvailabilityService.checkAvailability` (every 5 min) + `isWithinShift` (shared).
  - `DeliveryScheduleHelpersService.syncDeliveryAvailability` (on schedule change).
  - `AfkBreakResumeService.resumeDueBreaks` (every minute) — re-checks shift before re-onlining.
  - `DeliveryService.checkIn` — gate driver check-in to the shift window.
  - `DeliveryScheduleCronService.sendShiftReminders` (every minute) — matches the TIME 30 min out.

### Frontend / mobile

- Schedule pickers send a plain Egypt wall-clock **`"HH:mm"`** string for `openingTime` /
  `closingTime` (e.g. `"09:00"`); a bare instant / ISO string is **rejected** by `@ValidateTime`.
- Responses return `openingTime` / `closingTime` as `"HH:mm"` strings — display as-is, on mobile and
  admin alike. **No `+2h` read-back for schedule fields** (the flat `+2h` still applies to other
  `DateTime` instants like `createdAt`).
- Full request/response shapes and the driver check-in errors live in the dedicated
  **[Frontend / mobile integration guide](./timezone-frontend-mobile-integration.md)**.

### Database

- `opening_time` / `closing_time` are `TIME(0)`. Inspect them directly with SQL — the value you
  see **is** the Egypt wall-clock (e.g. `09:00:00`). No mental offset required.
- The container stays on **UTC**. Do **not** set `TZ=Africa/Cairo` — correctness no longer depends
  on the server timezone, and setting it would re-break the absolute instant columns.

---

## <a id="why-23-is-forbidden"></a>Why `+2` / `+3` is forbidden

A hardcoded `+2` or `+3` (or `getHours()` on a UTC server) is wrong because:

- **DST:** Egypt is UTC+2 for ~half the year and UTC+3 for the other half. A fixed offset is wrong
  for one of those halves. `Intl` resolves the right offset **per instant** — let it.
- **Future TZ changes:** Egypt has changed its DST policy several times (abolished 2014, partially
  reinstated 2023). The fix must not encode today's offset. Because the helper reads from ICU/tz
  data, a future rule change is picked up by shipping updated tz data — **no code change**.
- **Server independence:** correctness is anchored to the instant + the Cairo tz rule, not to the
  container clock. The container can be UTC (it is) and every rule is still correct.

If you find yourself typing `+ 2`, `+ 3`, `getHours()`, `setHours()`, or `getTimezoneOffset()` in
schedule logic — **stop** and use the helper instead.

---

## DST and future Egypt timezone changes

- The offset is resolved **per instant**: `2025-01-15T07:00Z → 09:00 Cairo` (winter, +2);
  `2025-07-15T06:00Z → 09:00 Cairo` (summer, +3). Same stored TIME (`09:00`) either way.
- Spring-forward / fall-back days are handled by `Intl` automatically (pinned by the helper
  tests).
- A future Egyptian DST-policy change is absorbed by the tz database — ship a Node build with
  current full ICU data and the rules follow. `assertEgyptTimeZoneAvailable()` fails the boot loudly
  if the runtime can't resolve Africa/Cairo (so it can't silently fall back to UTC).

---

## Migration / cleanup notes for existing rows

> **Existing pre-remediation rows are NOT yet in Option-A format.** Before this change the write
> path stored a UTC time-of-day; the old read paths re-added an offset (store `+3`, delivery `+2`).
> A one-time migration shifts the stored TIME so the new zero-offset reads reproduce the *intended*
> schedule.

- **New schedules created through the current code are correct** (Option-A wall-clock) and read
  correctly today.
- **Old un-migrated rows read WRONG** under the new zero-offset code until the migration is applied
  — do not trust them for boundary testing; create fresh schedules instead.
- The migration is `scripts/timezone-schedule-migration.ts` (pure core in
  `…-migration.core.ts`). It is **dry-run by default**, configurable (`--store-offset` /
  `--delivery-offset`, default `+3` / `+2`), and `--apply` **refuses to write** if any row would
  flip its open/closed decision at the cutover instant (status-neutrality gate) unless `--force`.
- A single fixed offset is **approximate** — the original client→stored conversion baked in
  whatever DST offset was in effect *at row-creation time*, which can't be recovered per row. Run
  the dry-run on a production snapshot, review the divergence report, then apply off-peak with a
  snapshot/rollback plan. `--reverse` rolls back.
- The permanent fix for all **future** rows is the new write path (`egyptWallClockToTimeColumn` from
  the DTO `"HH:mm"`); the migration only repairs legacy data.

---

## Common bugs (and how this design avoids them)

| Bug | Cause | Avoided by |
|---|---|---|
| Store open an hour early/late after a DST switch | hardcoded `+2`/`+3` | per-instant offset via `Intl` |
| Same schedule "open" in one path, "closed" in another | divergent offsets across read paths | one shared `isWithinWindow` + `timeColumnTo*` |
| Driver never auto-comes-online from schedule | cron only ever set `availableNow=false` (the "stuck offline" bug) | cron now sets both online **and** offline (`checkAvailability` L92–107) |
| `09:00` picker stored/displayed as `11:00` | applying an offset on read | zero-offset reads (Option A) |
| Midnight rollover puts "now" on the wrong day | `getDay()` on a UTC server | `toEgyptParts().dayOfWeek` derives the Cairo calendar day |
| Overnight shift (`22:00→02:00`) treated as empty/invalid | naive `now>=open && now<=close` | `isWithinWindow` overnight wrap |
| Empty window `09:00→09:00` treated as open-24h | `>=`/`<=` with equal bounds | `open===close ⇒ closed` |

> **Note (serializer `+2h`, non-schedule fields only):** the response serializer `localizedObject`
> (`src/globals/helpers/localized.return.ts`) adds a flat **`+2h`** to every genuine `Date` it
> returns on localized (mobile) responses and emits an ISO string. **Schedule `openingTime` /
> `closingTime` are exempt** — `ResponseService.stringifyScheduleTimes` rewrites them to `"HH:mm"`
> before the localizer runs, so a `09:00` schedule returns `"09:00"`, not `…T11:00:00.000Z`. The
> `+2h` on other instants (`createdAt`, order dates, …) is a separate, pre-existing concern, out of
> scope here, and never touched the open/closed logic (which compares the **stored** TIME).

---

## Worked examples

### 1. Store / branch — same-day window (`09:00 → 17:00`)

Stored: `opening_time = 09:00:00`, `closing_time = 17:00:00`.

| Cairo now | `minutesOfDay` | open=540 / close=1020 | `isOpen` |
|---|---|---|---|
| 08:59 | 539 | 539 < 540 | **closed** |
| 09:00 | 540 | 540 ∈ [540,1020] (inclusive) | **open** |
| 12:30 | 750 | inside | **open** |
| 17:00 | 1020 | 1020 ∈ [540,1020] (inclusive) | **open** |
| 17:01 | 1021 | 1021 > 1020 | **closed** |

### 2. Driver — overnight shift (`22:00 → 02:00`)

Stored: `opening_time = 22:00:00`, `closing_time = 02:00:00` (`close < open` → overnight wrap).

| Cairo now | seconds-of-day | rule (`now>=open || now<=close`) | online? |
|---|---|---|---|
| 21:59 | 79140 | 79140 < 79200 and > 7200 | **offline** |
| 22:00 | 79200 | `>= 79200` | **online** |
| 23:30 | 84600 | `>= 79200` | **online** |
| 00:30 | 1800 | `<= 7200` | **online** |
| 02:00 | 7200 | `<= 7200` (inclusive) | **online** |
| 02:01 | 7260 | not `>=79200`, not `<=7200` | **offline** |

### 3. Driver availability (cron precedence)

`DeliveryAvailabilityService.checkAvailability` runs every 5 minutes and decides `availableNow`
with this precedence (highest first):

1. **On AFK break** → forced **offline**, schedule ignored.
2. **`forceAvailable`** (the "متاح إجباري" toggle) → forced **online**, schedule ignored.
3. **Schedule** → `isWithinShift(todaySchedules, secondsOfDay)` brings the driver both online and
   offline.

The same precedence is mirrored in `syncDeliveryAvailability` (on schedule change) and
`AfkBreakResumeService` (only re-online a driver whose break ended if they are within shift or
`forceAvailable`).

### 4. Store availability (branch `isOpen`)

`BranchService.calculateIsOpen` precedence:

1. `status === 'CLOSED'` → closed; `status === 'OPEN'`/`'BUSY'` (and not expired) → open.
2. `closed` or `temporarilyClosed` flag → closed.
3. No schedule rows at all → open (unless manually closed).
4. No schedule **for today** → closed.
5. Otherwise → `isWithinWindow(open, close, minutesOfDay)` over today's rows.

`ScheduleHelpersService.syncBranchOpenStatus` persists the schedule-derived result into
`Branch.closed` whenever a schedule is created/updated/deleted.

---

## Testing checklist

- [ ] `toEgyptParts` returns `+2` in winter, `+3` in summer, and handles spring-forward / fall-back
      days and midnight rollover.
- [ ] `timeColumnToHHmm` ↔ `egyptWallClockToTimeColumn("HH:mm")` round-trip; `egyptWallClockToMinutes`
      agrees with `timeColumnToMinutes` for the same wall-clock.
- [ ] DTO `@ValidateTime` accepts `09:00/17:30/22:15/00:05`, rejects `9:00/25:00/09:60/<ISO instant>`.
- [ ] Response pre-pass: `openingTime`/`closingTime` Dates serialize as `"HH:mm"` for **both**
      localized and admin; a sibling `createdAt` still gets the `+2h` localizer shift (mobile).
- [ ] `isWithinWindow` — inclusive at both ends, overnight wrap, `open===close ⇒ closed`,
      unit-agnostic.
- [ ] `timeColumnToMinutes` / `timeColumnToSeconds` read stored TIME with zero offset.
- [ ] `isWithinShift` — same-day inside/outside and overnight inside at 23:00 / 03:00.
- [ ] `checkAvailability` brings a driver **online** when inside the shift (the "stuck offline" fix)
      and **offline** when outside.
- [ ] `forceAvailable` and AFK-break override the schedule (break > forceAvailable > schedule).
- [ ] A freshly created `09:00→17:00` schedule reads back `09:00:00`/`17:00:00` in MySQL (no shift).
- [ ] Boundary checks at open / 1-min-before-open / close / 1-min-after-close behave per the tables
      above.

See the manual end-to-end procedure: **[timezone-manual-test-flow.md](./timezone-manual-test-flow.md)**.

---

## Source files (the real implementation)

**Helper (single source of truth)**
- `src/globals/helpers/egypt-time.helper.ts`
- `src/main.ts` (boot assertion `assertEgyptTimeZoneAvailable`)

**Delivery / driver**
- `src/_modules/delivery/delivery-availability.service.ts` (`isWithinShift`, `checkAvailability`)
- `src/_modules/delivery/delivery.service.ts` (`createSchedule`, `updateSchedule`, `checkIn`)
- `src/_modules/delivery/services/delivery.schedule.helper.service.ts` (`syncDeliveryAvailability`, `scheduleOverlap`)
- `src/_modules/delivery/services/afk-break-resume.service.ts`
- `src/_modules/delivery/services/delivery.schedule.cron.service.ts` (shift reminder)
- `src/_modules/delivery/dto/delivery.dto.ts` (`CreateDeliveryScheduleDTO`, `Schedule`, `CheckInDTO`)
- `src/_modules/delivery/controllers/delivery.schedule.controller.ts`

**Store / branch**
- `src/_modules/store/services/store.schedule.service.ts`
- `src/_modules/store/services/store.schedule.helper.service.ts` (`syncBranchOpenStatus`, `scheduleOverlap`)
- `src/_modules/store/dto/store.schedule.dto.ts` (`CreateScheduleDTO`, `UpdateStoreScheduleDTO`)
- `src/_modules/store/controllers/store.schedule.controller.ts`
- `src/_modules/branch/services/branch.service.ts` (`calculateIsOpen`)
- `src/globals/services/globalHelpers.service.ts` (`getServiceSchedule`, `getStoreAvailableDays`)

**Schema**
- `prisma/schema/store.prisma` (`StoreSchedule`, `Days` enum)
- `prisma/schema/user.prisma` (`DeliverySchedule`)

**Validation & response contract**
- `src/decorators/dto/validators/validate-time.decorator.ts` (`@ValidateTime` → `"HH:mm"` — the schedule DTOs)
- `src/globals/services/response.service.ts` (`stringifyScheduleTimes` → `"HH:mm"` on every response)

**Migration**
- `scripts/timezone-schedule-migration.ts` (CLI, dry-run by default)
- `scripts/timezone-schedule-migration.core.ts` (pure, testable core)

**Tests**
- `src/globals/helpers/__test__/egypt-time.helper.spec.ts`
- `src/_modules/delivery/__test__/delivery-availability.spec.ts`
- `scripts/__test__/timezone-schedule-migration.core.spec.ts`

---

## <a id="known-ambiguity-iso-instant-vs-stamped-z"></a>Resolved — the ISO-instant ambiguity is gone

Earlier the schedule fields were an ISO **instant**, which left a real ambiguity: a client could send
a true Cairo-zoned instant (`2026-06-15T09:00:00+03:00`) **or** the picked wall-clock stamped `Z`
(`2026-06-15T09:00:00Z`), and the two stored different times — needing a frontend confirmation.

The **`"HH:mm"` contract removes this entirely.** The client sends `"09:00"`, the backend stores
`09:00`, and there is nothing to interpret — no instant, no offset, no DST at write time. No frontend
confirmation is needed for the wire format anymore.
