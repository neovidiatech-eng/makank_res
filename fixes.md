# Fixes Log — Makanak API

A running reference of bugs fixed in this codebase. Newest first. Each entry records the symptom,
the real root cause (proven in code), the change made, and how it was verified.

---

## 2026-06 — DELIVERED proximity check crashed for delivery drivers (addressId not selected)

**Symptom:** When a delivery driver marks an order `DELIVERED` (sending GPS coords), the request
fails — the customer-proximity check throws instead of running.

**Files:**
- `src/_modules/order/prisma-args/order.helpers.prisma.arg.ts` (`selectOrderByIdForValidationOBJ`)
- `src/_modules/order/order.service.ts` (`changeStatus`, DELIVERED branch ~line 822)

**Root cause:** `order.service.ts:827` does
`prisma.address.findUnique({ where: { id: order.addressId } })`, but the validation select never
fetched `addressId`, so at runtime `order.addressId` is `undefined`. In Prisma 5.22,
`findUnique({ where: { id: undefined } })` throws `PrismaClientValidationError` (a unique lookup
needs a defined key — unlike `findMany`, it does not ignore `undefined`). `changeStatus`
(`order.controller.ts:133`) is the only path drivers use to set DELIVERED, and the location block
runs only for `RolesKeys.DELIVERY`, so driver delivery-completion was broken on this path while
store/admin (who skip the block) were unaffected — which is why it went unnoticed. Same
select-widening class of bug as the PICKUP fix below.

**Change:**
- Added `addressId: true` to the validation select.
- Guarded the lookup with `if (order.addressId) { ... }` — `addressId` is nullable in the schema
  (`order.prisma:10`, `Int?`) because PICKUP / CUSTOM_DELIVERY orders have no address; without the
  guard those would crash on `findUnique({ where: { id: null } })`.

**Behavioral note (intended, previously dormant):** for DELIVERY orders whose address has
coordinates, the driver must now be within 500m of the customer location to mark DELIVERED — the
feature working as designed. Best-effort: skipped when the address has no coords, and the 500m
threshold is lenient. Recommend a real-environment check: a delivery driver completing an order near
the customer succeeds; PICKUP/CUSTOM_DELIVERY completion does not crash.

**Verification:** `npm run build` passes.

---

## 2026-06 — B2: "Order Ready" notification reaching wrong / multiple users

**Reported symptom:** When an order became `READY_PICKUP`, a notification meant only for the order's
customer was delivered to multiple/unrelated users.

**Audit's (incorrect) theory:** PROJECT_PHASES.md B2 blamed `storeImportantStatuses` in
`order.service.ts`. Disproven — that list only suppresses store notifications (intended) and cannot
cause a broadcast. The `userId: undefined` → "Prisma returns all sessions" theory was also ruled out
for this path (`Order.userId` is a required, selected FK).

This investigation produced **three** fixes (one root cause + two related/hardening):

### Fix 1 — FCM token attached to multiple users (root cause)
- **File:** `src/_modules/authentication/services/jwt.service.ts` (`generateToken`)
- **Root cause:** On login, the FCM-token dedup cleared the token only on the **same user's**
  sessions (`where: { userId, fcmToken }`). A shared device's token stayed registered under every
  prior account, so a push to one customer fanned out to everyone who had logged in on that device.
- **Change:** dropped the `userId` scope so the token is detached from **all** sessions before being
  reattached to the new one:
  ```ts
  await this.prisma.session.updateMany({
    where: { fcmToken: normalizedFcmToken },   // was: { userId, fcmToken }
    data: { fcmToken: null },
  });
  ```
- **Effect:** each FCM token now maps to at most one user — the property targeted delivery relies on.

### Fix 2 — Defensive guard against accidental broadcast (hardening)
- **File:** `src/globals/services/notification.service.ts` (`sendLocalizedNotification`)
- **Root cause:** `prisma.session.findMany({ where: { userId: undefined } })` drops the filter and
  returns **every** user's sessions → push to all. Latent footgun for any caller passing a falsy id.
- **Change:** early return when `userId` is falsy:
  ```ts
  if (!userId) {
    this.logger.warn('sendLocalizedNotification called without userId — skipping to avoid broadcast');
    return;
  }
  ```
- **Effect:** no future caller can accidentally broadcast; no behavior change for valid ids.

### Fix 3 — PICKUP orders wrongly triggered driver assignment (related bug)
- **File:** `src/_modules/order/prisma-args/order.helpers.prisma.arg.ts`
  (`selectOrderByIdForValidationOBJ`)
- **Root cause:** the guard at `order.service.ts:957`
  (`... && order.type !== OrderType.PICKUP`) is meant to skip auto-assignment for self-pickup orders,
  but the validation select didn't fetch `type`, so `order.type` was `undefined` at runtime →
  `undefined !== 'PICKUP'` is always true. Every PICKUP order marked `READY_PICKUP` auto-assigned a
  driver and sent a spurious "New Order" push (and could be hijacked into the delivery flow if the
  driver accepted, plus skew earnings on `DELIVERED`).
  - *Why it compiled:* the select is typed as the broad `Prisma.OrderSelect`, so non-selected fields
    still type-check but are `undefined` at runtime.
- **Change:** added `type: true` to the select so `order.type` is populated; the guard now works like
  the already-correct one at `order.service.ts:395`.
- **Business rule confirmed (6 places):** PICKUP = customer collects from the store, never a driver —
  `order.service.ts:118` (delivery price 0), `:168,:303` (skip delivery/ETA), `:395` (no
  auto-assign at creation), `:703-705` (driver travel time 0), `:957` (this fix), and `:1035-1037`
  (manual `assign()` **throws** for PICKUP).
- **Bonus:** the manual-assign guard at `order.service.ts:1035` reads `order.type` from the same
  `getOrderById()` and was therefore **also silently broken** (would have let an admin assign a driver
  to a PICKUP order). The same `type: true` addition restored it too.

**Verification (all three):**
- `npm run build` — passes.
- Repeatable test scripts (no dev server needed, only MySQL; each creates throwaway rows and cleans
  up, and was confirmed to FAIL when the fix is reverted and PASS when applied):
  - `npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-token-hygiene.ts`
    — drives the real `TokenService.generateToken` twice on one device token; asserts the token ends
    on one user only + the table-wide no-shared-token invariant.
  - `npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-pickup-assignment.ts`
    — loads PICKUP/DELIVERY orders via the real `selectOrderByIdForValidationOBJ` and evaluates the
    exact `order.service.ts:957` guard; asserts PICKUP is skipped and DELIVERY still assigns.
- Pending real-environment checks (need MySQL + Redis, real data):
  - Duplicate-token query trends to empty after devices re-register:
    ```sql
    SELECT fcmToken, COUNT(DISTINCT user_id) AS users
    FROM sessions WHERE fcmToken IS NOT NULL
    GROUP BY fcmToken HAVING users > 1;
    ```
  - Login as A then B on the same token → only B's session holds it; READY_PICKUP order owned by A no
    longer pushes to B's device.
  - Create a PICKUP order, mark it `READY_PICKUP` → no `orderDeliveryAssignment` row, no driver push.

**Known related issues found but NOT fixed (flagged for later):**
- ~~`order.service.ts:827` `order.addressId` absent from select~~ — **fixed** (see the DELIVERED
  proximity entry above).
- `user.service.ts:265-271` notification-setting update is also `userId`-scoped (not a cross-user
  leak, lower priority).
- Debug `console.log` lines left in `notification.service.ts` (~lines 53, 87).
