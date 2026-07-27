# Manual QA Flow — Egypt Wall-Clock Schedules (Option A)

A hands-on, local procedure to verify the timezone remediation: store/branch hours and driver
shift windows now treat schedule `@db.Time` columns as the **literal Egypt (Africa/Cairo)
wall-clock**, read with **zero offset**. Background and rationale:
**[timezone-handling.md](./timezone-handling.md)**.

You'll use **Swagger** (`http://localhost:3030/api/docs`), **direct DB inspection** (read-only
SQL), and a couple of one-liners to compute "Cairo now".

---

## ⚠️ Read this first — legacy rows are NOT migrated

The one-time data migration (`scripts/timezone-schedule-migration.ts`) has **not been applied**.
Therefore:

- **Pre-existing schedule rows in the DB are still in the OLD format** (a UTC time-of-day with the
  old offset baked in). Under the new zero-offset code they will read **WRONG**. **Do not trust
  them** for boundary testing.
- **Schedules you create now, through the running app, are correct Option-A wall-clock** and will
  read/compare correctly.

➡️ **For every boundary test below, create a FRESH schedule via the API.** Treat any legacy row as
suspect until the migration is run. (You can still *list* legacy rows to understand existing data,
but don't use them to judge correctness.)

### Two more "don't be confused" notes

1. **Schedule times are `"HH:mm"` in and out.** You send `"09:00"`; the API returns `"09:00"`
   (mobile and admin alike). The response pre-pass exempts schedule fields from the serializer's flat
   `+2h`, so you can verify open/close values straight off the API. **Other** timestamps (`createdAt`,
   order dates) still carry the `+2h` on localized responses — that's a separate, unchanged concern.
   Storage can still be cross-checked in the DB (`opening_time`/`closing_time` hold the literal
   wall-clock).
2. **Keep the container/DB on UTC.** Do **not** set `TZ=Africa/Cairo`. Correctness no longer
   depends on server TZ.

---

## Prerequisites

- App running locally (`npm run start:dev`), MySQL + Redis up (confirm with the team — don't assume).
- A **local/dev** MySQL you can run **read-only `SELECT`s** against (and the clearly-marked
  test-only writes in the cleanup section). **Never run writes against production.**
- Auth tokens for the surfaces you'll test:
  - An **admin** token (can create schedules for any driver/branch, set store status).
  - Optionally a **driver** token (to self check-in) and a **store-owner** token (branch-scoped).
- A MySQL client (`mysql` CLI, TablePlus, DBeaver, …). All SQL below is **read-only** unless a
  block is explicitly marked `-- LOCAL / TEST DB ONLY`.

---

## <a id="step-1-compute-cairo-now"></a>Step 1 — Compute "Cairo now"

You'll place test windows relative to the **real current Cairo wall-clock**. Get it with either:

**Node (uses the project helper):**

```bash
node -e "const {egyptNowParts}=require('./dist/globals/helpers/egypt-time.helper'); const p=egyptNowParts(); console.log(p.dayOfWeek, String(p.hours).padStart(2,'0')+':'+String(p.minutes).padStart(2,'0'), 'secondsOfDay='+p.secondsOfDay)"
```

(Requires a build — `npm run build`. If you haven't built, use the pure-`Intl` version below.)

**Pure `Intl` (no build needed):**

```bash
node -e "console.log(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',weekday:'long',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()))"
```

Write down **today's Cairo day** (e.g. `MONDAY`) and the **current Cairo HH:mm** — you'll position
windows around it. The `Days` enum values are `SUNDAY … SATURDAY` (uppercase).

> **What to send.** The schedule DTOs take a plain Egypt wall-clock **`"HH:mm"`** string (e.g.
> `"09:00"`) — no instant, no offset, no conversion. Just send the Cairo wall-clock you want stored.
> (There is no longer any ISO-instant ambiguity to worry about — that
> [was resolved](./timezone-handling.md#known-ambiguity-iso-instant-vs-stamped-z) by the `HH:mm`
> contract.)

---

## Step 2 — Discover usable existing records (read-only)

You need real IDs to attach schedules to. Run these **read-only** queries and plug the results into
the `<PLUG_IN_*>` placeholders later. (IDs are environment-specific — discover, don't hardcode.)

```sql
-- A branch to attach store schedules to (and its store).
-- Table is `branches`; `closed` and `status` are un-mapped columns.
SELECT b.id AS branch_id, b.store_id, b.is_main_branch, b.status, b.closed, b.temporarily_closed
FROM branches b
WHERE b.deleted_at IS NULL
ORDER BY b.id
LIMIT 10;

-- A delivery user (driver) to attach driver schedules to.
-- User table is `users`; DeliveryDetails table is `details` (mapped name).
SELECT u.id AS delivery_user_id, u.name, u.phone, dd.available_now, dd.force_available
FROM users u
JOIN details dd ON dd.user_id = u.id
WHERE u.role_key = 'DELIVERY' AND u.deleted_at IS NULL
ORDER BY u.id
LIMIT 10;

-- (Optional) a service on the chosen store, for the scheduled-slots endpoint.
-- Verify the service table/column maps in prisma/schema/service.prisma.
SELECT s.id AS service_id, s.store_id, s.duration_minutes
FROM service s
WHERE s.duration_minutes IS NOT NULL AND s.duration_minutes > 0
ORDER BY s.id
LIMIT 10;
```

> Table/column names follow the Prisma `@@map` / `@map`: `branches`, `users`, `details`
> (DeliveryDetails), `store_schedule`, `delivery_schedule`, `available_now`, `force_available`.
> Confirm any you're unsure of against `prisma/schema/*.prisma` (the `service` table map in
> particular).

**Inspect (but don't trust) any legacy schedule rows:**

```sql
SELECT id, branch_id, day, opening_time, closing_time FROM store_schedule ORDER BY id;
SELECT id, delivery_id, day, opening_time, closing_time FROM delivery_schedule ORDER BY id;
```

If `opening_time` here looks 2–3h off from what you'd expect, that's the **un-migrated legacy
offset** — exactly why you create fresh rows below.

---

## Step 3 — Store / branch schedule availability

### 3a. Create a same-day window `09:00 → 17:00` (FRESH row)

**Swagger:** `POST /api/schedule` (tag **schedule**, `@Auth`). As admin, set `branchId`
explicitly; as a store-owner the branch is taken from your token.

Pick `day` = **today's Cairo day** (from Step 1) so the open-check evaluates now.

```json
{
  "branchId": <PLUG_IN_BRANCH_ID>,
  "day": "<TODAY_CAIRO_DAY>",
  "openingTime": "09:00",
  "closingTime": "17:00"
}
```

### 3b. Confirm storage is wall-clock (zero shift)

```sql
SELECT id, branch_id, day, opening_time, closing_time
FROM store_schedule
WHERE branch_id = <PLUG_IN_BRANCH_ID>
ORDER BY id DESC
LIMIT 5;
```

**Expected:** `opening_time = 09:00:00`, `closing_time = 17:00:00` — **identical** to the Cairo
wall-clock you sent, with **no +2/+3 shift**. Read as seconds-of-day to be explicit:

```sql
SELECT id,
       TIME_TO_SEC(opening_time) AS open_sec,   -- expect 32400  (9*3600)
       TIME_TO_SEC(closing_time) AS close_sec   -- expect 61200  (17*3600)
FROM store_schedule
WHERE branch_id = <PLUG_IN_BRANCH_ID>
ORDER BY id DESC LIMIT 1;
```

If `open_sec` were `39600` (11:00) or `43200` (12:00) you'd be looking at an old `+2`/`+3` shift —
it must be **32400**.

### 3c. Verify the `isOpen` flag

`GET /api/branch?id=<PLUG_IN_BRANCH_ID>` (or `GET /api/branch/<id>`). The response includes
`isOpen` from `BranchService.calculateIsOpen`.

- Make sure the branch has no overriding state: `status` not `CLOSED`, `closed`/`temporarilyClosed`
  false, and `busyUntil` not in the future. Otherwise those win **before** the schedule
  (precedence: status → flags → schedule). Use `PATCH /api/store/<id>/status` with
  `{ "status": "NORMAL" }` (or `OPEN`) to clear an override if needed.
- **Expected `isOpen`:** `true` if the current Cairo time is within `09:00–17:00` today, else
  `false`.

### 3d. Boundary cases (store)

The cleanest boundary test is to create a window whose edge is **exactly "now"**. Let Cairo-now =
`HH:MM` (from Step 1). Create a fresh window and check `isOpen` immediately. `isWithinWindow` is
**inclusive** at both ends.

| Case | Window to create (Cairo) | Expected `isOpen` | Why |
|---|---|---|---|
| **Exactly at open** | open = now, close = now+1h | **true (open)** | `now === open` is inclusive-inside |
| **One min before open** | open = now+1min, close = now+2h | **false (closed)** | `now < open` |
| **Exactly at close** | open = now−1h, close = now | **true (open)** | `now === close` is inclusive-inside |
| **One min after close** | open = now−2h, close = now−1min | **false (closed)** | `now > close` |

> Delete the previous test row (Step 8) before creating the next, or use a non-overlapping `day`,
> to avoid the overlap validation (`OVERLAPPING_SCHEDULE`) and to keep `calculateIsOpen` reading a
> single window.

### 3e. Overnight window `22:00 → 02:00` (store)

```json
{
  "branchId": <PLUG_IN_BRANCH_ID>,
  "day": "<TODAY_CAIRO_DAY>",
  "openingTime": "22:00",
  "closingTime": "02:00"
}
```

> Note: `scheduleOverlap` rejects a schedule where `close <= open` **on the same calendar day** with
> `INVALID_SCHEDULE`. The store create path runs `scheduleOverlap` in the controller, so a pure
> overnight `22:00→02:00` may be rejected at create time even though the **runtime** open-check
> (`isWithinWindow`) fully supports overnight wrap. If you hit `INVALID_SCHEDULE`, that's the
> create-time validator, not the wall-clock logic. To exercise overnight **read** behavior without
> fighting the validator, you may insert a test-only row directly (see
> [overnight test-only insert](#overnight-insert) in cleanup) — clearly LOCAL/TEST DB ONLY.

Expected `isOpen` for a stored `22:00→02:00` overnight window: **open** at 22:00–23:59 and
00:00–02:00 (inclusive), **closed** at 02:01–21:59.

### 3f. Confirm the old `+2/+3` is gone

Create `09:00→17:00` and pick a current Cairo time where the **old** behavior would disagree with
the new. Example: if Cairo-now is **08:30**, the store should be **closed** (08:30 < 09:00). Under
the **old** store read-path (`+3` baked in / re-added), an `09:00` stored as a UTC-shifted value
would have been mis-evaluated and could read **open**. With Option A: `opening_time` is literally
`09:00:00`, `08:30 < 09:00` → **closed**. The DB value (`32400` sec) and the `isOpen=false` flag
together prove no offset is being applied.

---

## Step 4 — Delivery / driver schedule availability

### 4a. Create a driver shift `09:00 → 17:00` (FRESH row)

**Swagger:** `POST /api/deliveryData/schedule` (tag **Delivery**, `@Auth`). As admin you pass
`deliveryId`; as the driver it defaults to your own id.

```json
{
  "deliveryId": <PLUG_IN_DELIVERY_USER_ID>,
  "day": "<TODAY_CAIRO_DAY>",
  "openingTime": "09:00",
  "closingTime": "17:00"
}
```

Creating a schedule triggers `syncDeliveryAvailability`, which sets `availableNow` immediately
based on the current Cairo time vs the shift.

### 4b. Confirm storage (zero shift)

```sql
SELECT id, delivery_id, day, opening_time, closing_time,
       TIME_TO_SEC(opening_time) AS open_sec,   -- expect 32400
       TIME_TO_SEC(closing_time) AS close_sec   -- expect 61200
FROM delivery_schedule
WHERE delivery_id = <PLUG_IN_DELIVERY_USER_ID>
ORDER BY id DESC LIMIT 5;
```

**Expected:** `09:00:00` / `17:00:00` — no shift.

### 4c. Verify `availableNow`

```sql
-- DeliveryDetails maps to table `details`.
SELECT user_id, available_now, force_available
FROM details
WHERE user_id = <PLUG_IN_DELIVERY_USER_ID>;
```

- **Expected `available_now`:** `1` (online) if Cairo-now ∈ `[09:00, 17:00]`, else `0`.
- The 5-minute cron (`DeliveryAvailabilityService.checkAvailability`) keeps this in sync; the
  on-create `syncDeliveryAvailability` sets it instantly so you don't have to wait. To force a
  re-evaluation without waiting for the cron, create/delete a schedule (both call the sync), or wait
  up to 5 minutes.

### 4d. Boundary cases (driver) — same inclusive rule

| Case | Window (Cairo) | Expected `available_now` | Why |
|---|---|---|---|
| **Exactly at open** | open = now, close = now+1h | **1 (online)** | inclusive at open |
| **One min before open** | open = now+1min, close = now+2h | **0 (offline)** | before open |
| **Exactly at close** | open = now−1h, close = now | **1 (online)** | inclusive at close |
| **One min after close** | open = now−2h, close = now−1min | **0 (offline)** | after close |

Re-check `available_now` after each create (the sync runs on create). Delete the prior row first to
avoid `OVERLAPPING_SCHEDULE`.

### 4e. Driver check-in boundary (`POST /api/deliveryData/schedule/:id/check-in`)

`DeliveryService.checkIn` uses the same Cairo wall-clock and zero-offset read. With a fresh
`09:00→17:00` row for today and body `{ "lat": <lat>, "lng": <lng> }`:

- Before `09:00` Cairo → `409 The shift has not started yet`.
- Within the window → check-in succeeds, `available_now` becomes `1`.
- After `17:00` Cairo → `409 The shift has already ended`.
- If `schedule.day` ≠ today's Cairo day → `409 Today is <day>, but this schedule is for <day>`.
- If the driver is on an AFK break → `409 You are on a break until HH:MM`.
- If `requiredLat/requiredLng` set and you're farther than `requiredRadius` (default 100m) → `409`
  distance error.

### 4f. Overnight driver shift `22:00 → 02:00`

Same caveat as the store: the create-time `scheduleOverlap` rejects same-day `close <= open`
(`INVALID_SCHEDULE`). The **runtime** `isWithinShift` fully supports overnight wrap (verified in
`delivery-availability.spec.ts`: online at 23:00 and 03:00, offline at 12:00). To exercise overnight
read behavior, use the [test-only insert](#overnight-insert).

---

## Step 5 — `forceAvailable` precedence over schedule

`forceAvailable` (the "متاح إجباري" always-available toggle) **overrides** the schedule: the driver
is forced **online** even outside their shift.

1. Create a shift that is **outside** the current Cairo time (e.g. `01:00→02:00` if now is midday).
   Confirm `available_now = 0`.
2. Set the toggle: `PATCH /api/delivery/<id>` (admin) with `{ "forceAvailable": true }` — this also
   calls `syncDeliveryAvailability`.
3. Verify:

```sql
SELECT user_id, available_now, force_available
FROM details WHERE user_id = <PLUG_IN_DELIVERY_USER_ID>;
-- Expected: force_available = 1, available_now = 1  (online despite being outside the shift)
```

4. Turn it off (`{ "forceAvailable": false }`) and the driver falls back to schedule control:
   `available_now` returns to `0` (outside shift) on the next sync/cron.

---

## Step 6 — AFK-break precedence over schedule

An active AFK break **forces the driver offline** and is checked **before** both `forceAvailable`
and the schedule (precedence: **break > forceAvailable > schedule**). Break state lives in **Redis**
(`AfkBreakService`), not the DB.

1. Put the driver **inside** a valid shift (so they'd be online) — confirm `available_now = 1`.
2. Trigger an AFK break (per the AFK feature — see
   [bulk-assignment-and-afk-break.md](./bulk-assignment-and-afk-break.md): a driver who lets an
   assignment time out is benched ~15 min). Confirm the break is active (e.g. attempting
   `PATCH /api/delivery/<id>` `{ "forceAvailable": true }` returns `409 Driver is on a break until
   HH:MM`, and check-in returns the same).
3. Within ~5 minutes the availability cron forces the driver **offline** even though the schedule
   says online:

```sql
SELECT user_id, available_now FROM details WHERE user_id = <PLUG_IN_DELIVERY_USER_ID>;
-- Expected: available_now = 0  (break overrides an in-shift schedule)
```

4. When the break expires, `AfkBreakResumeService.resumeDueBreaks` (every minute) re-onlines the
   driver **only if** they are within shift or `forceAvailable`, and sends a "Break Over"
   notification.

---

## Step 7 — Scheduled store availability endpoints (optional)

These back the store-dashboard schedule UI and read the same Option-A TIME columns:

- `GET /api/schedule/<branchId>` — available days for a store/branch. `openingTime`/`closingTime`
  come back as `"HH:mm"` strings (e.g. `"09:00"`, `"17:00"`) — the response pre-pass formats them, so
  they match the wall-clock you sent with **no** serializer shift. Confirm a freshly created
  `09:00→17:00` row returns `"openingTime":"09:00","closingTime":"17:00"` (try it with both
  `locale: ar, islocalized: true` **and** `locale: admin` — identical either way).
- `GET /api/schedule/<serviceId>/<date>` — `getServiceSchedule`: builds open/closed slot windows for
  a **future** `date` from the branch's store schedule and existing bookings. Its
  `openingClosingTimes` are formatted to `"HH:mm"`; the `slots.{from,to}` are intentionally left as
  Date objects (booking-coupled, out of scope). `date` must not be in the past
  (`400 Date cannot be in the past`).

Sanity check: with a fresh `09:00→17:00` store schedule and a service `durationMinutes = 60`, the
`openingClosingTimes` should read `{"openingTime":"09:00","closingTime":"17:00"}`.

---

## Step 8 — Cleanup / rollback

Prefer deleting through the API so the open-status sync runs:

- Store: `DELETE /api/schedule/<scheduleId>` (re-syncs `Branch.closed`).
- Driver: `DELETE /api/deliveryData/schedule/<scheduleId>` (re-syncs `availableNow`).
- Reset the driver toggle: `PATCH /api/delivery/<id>` `{ "forceAvailable": false }`.
- Clear any store status override: `PATCH /api/store/<id>/status` `{ "status": "NORMAL" }`.

If you inserted test-only rows directly, remove them. **These writes are LOCAL / TEST DB ONLY —
never run against production:**

```sql
-- LOCAL / TEST DB ONLY — remove test schedules you created for a specific owner.
-- Double-check the id/owner before running. Confirm you are NOT on the prod DB.
DELETE FROM store_schedule    WHERE branch_id   = <PLUG_IN_BRANCH_ID>        AND id IN (<TEST_ROW_IDS>);
DELETE FROM delivery_schedule WHERE delivery_id = <PLUG_IN_DELIVERY_USER_ID> AND id IN (<TEST_ROW_IDS>);
```

```sql
-- LOCAL / TEST DB ONLY — reset driver availability flags after testing (table `details`).
UPDATE details
SET available_now = 0, force_available = 0
WHERE user_id = <PLUG_IN_DELIVERY_USER_ID>;
```

<a id="overnight-insert"></a>
**Overnight test-only insert** (bypasses the create-time `close<=open` validator to exercise the
runtime overnight read). **LOCAL / TEST DB ONLY:**

```sql
-- LOCAL / TEST DB ONLY — insert an overnight window directly to test isWithinWindow wrap.
-- TIME values are the LITERAL Egypt wall-clock (Option A). Replace placeholders.
INSERT INTO store_schedule (opening_time, closing_time, day, branch_id)
VALUES ('22:00:00', '02:00:00', '<TODAY_CAIRO_DAY>', <PLUG_IN_BRANCH_ID>);

INSERT INTO delivery_schedule (opening_time, closing_time, day, delivery_id, required_radius)
VALUES ('22:00:00', '02:00:00', '<TODAY_CAIRO_DAY>', <PLUG_IN_DELIVERY_USER_ID>, 100);
```

After inserting, verify `available_now` / `isOpen` per the overnight tables in
[timezone-handling.md](./timezone-handling.md#worked-examples), then delete the rows with the
test-only `DELETE` above.

---

## Expected-results quick reference

| Test | Expectation |
|---|---|
| Stored TIME for a sent `09:00`/`17:00` window | `opening_time=09:00:00` / `closing_time=17:00:00` (TIME_TO_SEC 32400 / 61200) — **no shift** |
| Same-day `09:00–17:00`, Cairo-now inside | branch `isOpen=true` / driver `available_now=1` |
| Exactly at open / close | **inside** (inclusive) |
| 1 min before open / 1 min after close | **outside** |
| Overnight `22:00–02:00`, Cairo-now 00:30 | inside (online/open) |
| Overnight `22:00–02:00`, Cairo-now 12:00 | outside |
| Empty window `09:00–09:00` | always **closed** |
| `forceAvailable=true`, outside shift | driver online (toggle overrides schedule) |
| AFK break active, inside shift | driver offline (break overrides everything) |
| Cairo-now 08:30 vs `09:00` open | **closed** — proves old `+2/+3` is gone |

---

## Related docs

- **[timezone-handling.md](./timezone-handling.md)** — the rule, rationale, helper API, migration
  notes, worked examples, testing checklist.
- **[bulk-assignment-and-afk-break.md](./bulk-assignment-and-afk-break.md)** — AFK-break mechanics.
- **[driver-management.md](./driver-management.md)** — driver dashboard / availability surfaces.
