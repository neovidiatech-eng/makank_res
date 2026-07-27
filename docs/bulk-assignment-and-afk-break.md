# Bulk Order Assignment, Batch Accept, AFK Break & Timeout Re-assignment

## Overview

This feature set improves operator and driver productivity around order assignment, and hardens
what happens when a driver ignores an assignment:

1. **Bulk assignment** — a moderator can assign one *or many* orders to a driver in a single
   request (the old single-order endpoint was refactored, not duplicated).
2. **Batch accept** — a driver can accept all of their pending order invitations at once.
3. **AFK break** — a driver who lets assignment(s) time out (doesn't respond within the 90s
   window) is treated as away and benched from the order pool for 15 minutes.
4. **Timeout re-assignment** — a timed-out order is automatically handed to the next-nearest
   available driver (in AUTO mode), instead of being stranded.

There are **no schema changes**. All break state lives in Redis; everything else reuses existing
tables (`OrderDeliveryAssignment`, `DeliveryDetails`, `Log`, `Settings`).

---

## 1. Bulk assignment

The single-order manual assignment endpoint was refactored so the **order IDs live in the request
body as an array** — a single source of truth that handles both one and many orders.

```
PATCH /api/orders/assign           (was PATCH /api/orders/:id/assign)
Auth: required (orders permission)
```

**Request body**

```json
{ "specialistId": 5, "orderIds": [101, 102, 103] }
```

| Field | Rules |
|-------|-------|
| `specialistId` | required — the driver (delivery user) id |
| `orderIds` | required — 1 to 20 positive integers |

**Response** — best-effort, per-order outcome:

```json
{
  "data": {
    "succeeded": [101, 103],
    "failed": [{ "orderId": 102, "reason": "Order type is pickup" }]
  }
}
```

**Behavior**

- Each order is validated with the *existing* single-order rules (order exists, not a `PICKUP`).
  A failure on one order never blocks the others.
- If the target driver is currently on an AFK break, the **whole request is rejected**
  (`400 Driver is on a break until HH:MM`) — a benched driver cannot be assigned.
- **Notification:** 1 successful order → the normal single-order push; more than one → a single
  aggregated *"You have N new orders"* push (`type: NEW_ORDERS_BATCH`). The per-order push is
  suppressed in the bulk case so the driver isn't spammed.
- The underlying per-order assignment logic (`createAssignment`: one `PENDING`
  `OrderDeliveryAssignment` row + a 90s `expiresAt`) is unchanged.

> **Client migration:** the only consumer (mobile/dashboard) must change the call from
> `PATCH /orders/:id/assign` with `{ specialistId }` to `PATCH /orders/assign` with
> `{ specialistId, orderIds }`.

---

## 2. Batch accept (driver)

A driver accepts all of their live pending invitations in one call. Existing per-order
accept/reject and `current-assignment` endpoints are untouched.

```
GET   /api/delivery/me/pending-assignments   → all non-expired PENDING assignments + order details
PATCH /api/delivery/me/assignments/accept    → accept all pending; { succeeded, failed }
```

- `accept` reuses the existing `acceptOrderAssignment` logic per order (sets `order.deliveryId`,
  moves `READY_PICKUP → ON_THE_WAY`), best-effort.
- Already-expired assignments are filtered out (`expiresAt > now`) and left for the timeout cron.
- There is **no batch reject** — "ignoring" an order means letting the 90s window lapse (see §3).

---

## 3. AFK break (15-minute bench)

When a driver lets assignment(s) lapse, the per-minute timeout cron
(`AssignmentTimerService.checkTimedOutAssignments`) marks the assignment `TIMEOUT`, notifies admin
(existing behavior), and then applies an **AFK break**.

### Immediate vs deferred

| Driver state at timeout | What happens |
|-------------------------|--------------|
| **Idle** (no active order) | Benched **immediately**: `availableNow = false`, 15-min break recorded, driver + admin notified, audit log written. |
| **On an active trip** (`PREPARING` / `READY_PICKUP` / `ON_THE_WAY`) | Break is **deferred** — flagged as owed. It is applied when the driver finishes their **last** active trip (on the `DELIVERED` transition, once no active orders remain). The driver is never benched mid-trip. |

### While on break, the driver cannot come back early

The break is honored everywhere availability is granted:

- **Availability cron** (`DeliveryAvailabilityService`) keeps the driver offline, overriding even
  `forceAvailable`.
- **`checkIn`** is rejected (`You are on a break until HH:MM`).
- **`forceAvailable` toggle** is rejected.
- **Manual/bulk assign** (`PATCH /orders/assign`) is rejected.
- **Auto-assign** already excludes them because `availableNow = false`.

### Auto-resume

A per-minute cron (`AfkBreakResumeService`) restores drivers whose 15 minutes are up:

- If still **within shift** (or `forceAvailable`) → back online (`availableNow = true`) +
  *"break over"* push.
- If their shift ended during the break → stays offline.
- Either way the break record is cleared.

### Admin visibility

Each applied break writes a **`Log`** row (`action: "AFK_BREAK"`, `userRole: "DELIVERY"`,
queryable via the Logs feature) **and** sends a push to all admins. The existing per-order
"delivery did not respond" admin notifications are unchanged.

---

## 4. Timeout re-assignment (mode-respecting)

After the timeout cron applies AFK breaks, it re-assigns each timed-out order to the next-nearest
available driver (`OrderService.reassignAfterTimeout`).

- **Mode-aware:** routed through `handleOrderAssignment`, so it honors the `deliveryAssignmentMode`
  setting:
  - **AUTO** → the order is re-assigned automatically.
  - **MANUAL** → no re-assignment; the order is left for the moderator (admin already notified).
- **Excludes the driver who just let it lapse** so the order doesn't bounce straight back. (Idle
  drivers are also excluded because they're now benched.)
- **No-op guards:** order already has a driver, is a `PICKUP`, or is in a terminal state
  (`DELIVERED` / `CANCELLED` / `REJECTED` / `PAYMENT_FAILD` / `PENDING_PAYMENT`).
- **Pickup-location dependency:** re-assignment reuses the nearest-driver search, which needs the
  order's branch coordinates (or `pickupLat/Lng` for `CUSTOM_DELIVERY`). Orders without a
  geolocated pickup are skipped — the same limitation the initial auto-assignment already has.
- **Bounded churn:** every timed-out driver is benched 15 min and excluded, so an order can't loop
  endlessly; when the available pool is exhausted it simply stops. There is no max-retry cap.

---

## Configuration

| Setting | Domain | Default | Meaning |
|---------|--------|---------|---------|
| `deliveryAcceptanceTimer` | DELIVERY | `90` (sec) | Existing — how long a driver has to accept. |
| `deliveryAfkBreakMinutes` | DELIVERY | `15` (min) | New — AFK break duration. Falls back to 15 if unset. |
| `deliveryAssignmentMode` | DELIVERY | `AUTO` | Existing — `AUTO` enables auto-assign **and** timeout re-assignment; `MANUAL` disables both. |

## Redis keys (all via `AfkBreakService`, fail-open)

| Key | Type | Purpose |
|-----|------|---------|
| `delivery:afk-breaks` | sorted set (member = userId, score = breakUntil epoch ms) | Active breaks; "due" = score ≤ now. |
| `delivery:afk-pending:<userId>` | string (`EX 86400`) | "Owed/deferred break" flag for a driver who was mid-trip at timeout. |

A Redis outage never blocks ordering/assignment: reads fail open (treated as "not on break"),
writes are logged and skipped.

## Files

**New**
- `src/globals/services/afk-break.service.ts` — Redis break state (suspend / isOnBreak / pending / due / clear).
- `src/_modules/delivery/services/afk-break-resume.service.ts` — per-minute auto-resume cron.

**Changed**
- `src/_modules/order/dto/order.dto.ts` — `AssignOrderDTO` now takes `orderIds[1..20]`.
- `src/_modules/order/controllers/order.controller.ts` — route `→ PATCH /orders/assign`.
- `src/_modules/order/order.service.ts` — bulk `assign`, batch accept, `applyOrDeferAfkBreak` /
  `applyAfkBreakNow`, deferred-break-on-DELIVERED, `reassignAfterTimeout`.
- `src/_modules/order/services/assignment.service.ts` — `createAssignment(..., { notify })`;
  `assignToNearestDelivery` / `handleOrderAssignment` accept an `excludeDeliveryIds` list.
- `src/_modules/order/services/timer.service.ts` — applies AFK breaks + re-assigns timed-out orders.
- `src/_modules/delivery/delivery.controller.ts` — 2 new driver routes.
- `src/_modules/delivery/delivery.service.ts` — break guards in `checkIn` and the `forceAvailable` toggle.
- `src/_modules/delivery/delivery-availability.service.ts` — break guard + shared `isWithinShift`.
- `src/_modules/delivery/delivery.module.ts`, `order.module.ts`, `global.module.ts`,
  `settings/settings.ts` — wiring + the new setting.

---

## Test coverage

An integration test boots the **real Nest application context** (so it exercises the actual DI
graph — including the `timer ↔ order` `forwardRef` and the global `AfkBreakService`), stops the
cron schedulers so background ticks can't race assertions, then drives each scenario against real
MySQL + Redis. Time-based behavior is fast-forwarded by writing past `expiresAt` / past break
scores rather than waiting 90s / 15min.

**File:** `scripts/test-afk-break.ts` — 43 assertions across 12 scenarios:

| # | Scenario |
|---|----------|
| 1 | `AfkBreakService` Redis primitives (suspend / isOnBreak / pending / due / clear) |
| 2 | Idle driver times out → immediate break + bench + `AFK_BREAK` log |
| 3 | Busy driver times out → deferred, not benched mid-trip |
| 4 | `applyAfkBreakNow` (the path the DELIVERED hook calls) |
| 5 | Resume when break is up **and** in shift → back online |
| 6 | Resume when break is up but **off** shift → stays offline |
| 7 | Guard: manual assign rejected for an on-break driver |
| 8 | Guard: `checkIn` rejected for an on-break driver |
| 9 | Guard: availability cron forces an on-break driver offline (overrides `forceAvailable`) |
| 10 | Bulk assign: best-effort, `PICKUP` rejected, rows created |
| 11 | Batch accept: accepts all live pending, skips expired ones, moves orders to `ON_THE_WAY` |
| 12 | Timeout re-assignment respects mode (AUTO re-assigns & skips the timed-out driver; MANUAL does not) |

### How to run

> ⚠️ Uses real MySQL + Redis and runs real cron-reconciliation passes (equivalent to one normal
> tick), and briefly toggles `deliveryAssignmentMode` during scenario 12.
> **Run against dev/staging, not production.**

Prerequisites: MySQL + Redis running, roles seeded (`npm run db:seed`).

```powershell
npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-afk-break.ts
```

- Add `--keep` to leave the test rows in place for inspection (otherwise it self-cleans all test
  users / orders / logs / Redis keys and restores the original assignment mode).
- Filter the noisy query log to just results:

```powershell
npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-afk-break.ts 2>$null |
  Select-String -Pattern '✅|❌|passed,|^\d+\)|===='
```

Exit code is `0` when all assertions pass, `1` otherwise.

### Not covered by the script (verify manually if needed)

- The full `changeStatus → DELIVERED` transition (it pulls in wallet/transaction side effects);
  the script tests the deferred-break *flag* and the *apply* path it calls separately.
- The HTTP/auth layer of the endpoints (tested at the service level); confirm via Swagger
  (`/api/docs`) with a real token.
- FCM push payload content (notifications enqueue to Bull; the script asserts DB/Redis state).
