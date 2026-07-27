# Fortune Wheel — Implementation & Status

> Status: **Phase 2 complete — display gating, spin, win, store, and checkout redemption are all implemented.**
> Last updated: 2026-06-05

This document describes what has been implemented for the Fortune Wheel feature and the design
decisions behind it. The feature is a full end-to-end loop: an admin configures the wheel, a
customer becomes eligible, spins, wins a reward, and redeems it at checkout.

---

## 1. What this feature is

A customer-facing promotional wheel. An admin configures a global display interval and a set of
weighted reward items. The backend is the **source of truth** for whether a customer may see/spin
the wheel right now (so the rule can't be bypassed by clearing local storage or switching devices)
and for what the customer wins.

The full lifecycle:

1. Admin enables the wheel and defines reward items (`/settings`, item CRUD).
2. Customer asks if the wheel should show (`GET /eligibility`); the backend gates on a per-user
   countdown.
3. Customer spins (`POST /spin`); the backend picks a weighted winner, starts the next countdown,
   and persists the win as a redeemable reward.
4. Customer redeems the reward at checkout by passing `fortuneRewardId` to the order; the order
   flow validates and consumes it atomically.

---

## 2. Database schema

`prisma/schema/fortune-wheel.prisma` (4 models). Applied to MySQL via `prisma db push`
(no migration history — project convention).

- **`FortuneWheelSettings`** — global, single active record.
  - `id`, `displayIntervalHours`, `isEnabled` (default `true`), `createdAt`, `updatedAt`.
  - The display interval is a **global** setting, not per-item.
- **`FortuneWheelItem`** — reward catalog entries (the wheel segments).
  - `id`, `displayName`, `rewardType` (`FortuneWheelRewardType`), `rewardValue` (`Int?`),
    `weight` (default `1`, used for weighted selection), `maxDiscount` (`Int?`),
    `minOrderAmount` (`Int?`), `maxOrderAmount` (`Int?`), `rewardExpiryHours` (`Int?`),
    `isActive` (default `true`), `sortOrder` (default `0`), timestamps, soft-delete `deletedAt`.
  - Back-relation `UserRewards FortuneWheelUserReward[]`.
- **`FortuneWheelUserState`** — per-user visibility / spin tracking.
  - `id`, `userId` (unique, FK → `User`, `onDelete: Cascade`), `lastShownAt`, `lastSpunAt`,
    `nextEligibleAt`, timestamps.
- **`FortuneWheelUserReward`** — a won, redeemable prize (the reward ledger).
  - `id`, `userId` (FK → `User`, `onDelete: Cascade`), `itemId` (`Int?`, FK → `FortuneWheelItem`,
    `onDelete: SetNull`), a **snapshot** of `rewardType` / `rewardValue` / `maxDiscount` /
    `minOrderAmount` / `maxOrderAmount` (so later edits to the item don't change a won reward),
    `status` (`FortuneWheelRewardStatus`, default `VALID`), `expiresAt`, `redeemedAt`,
    `redeemedOrderId`, timestamps, soft-delete `deletedAt`. Indexed on `userId`.

`prisma/schema/user.prisma`: back-relations
`FortuneWheelState FortuneWheelUserState?` and `FortuneWheelRewards FortuneWheelUserReward[]`.

`prisma/schema/enum.prisma`:
- `FortuneWheelRewardType { DISCOUNT, FREE_DELIVERY, FIXED_AMOUNT, CUSTOM, NONE }`
  - `NONE` = a "better luck next time" segment (spin lands on it, no reward persisted).
- `FortuneWheelRewardStatus { VALID, USED, EXPIRED }`
  - In practice rewards are `VALID` → `USED`. Expiry is evaluated **lazily** by comparing
    `expiresAt` to now; the `EXPIRED` status value is reserved and not currently written.

> Soft-delete and the implicit `deletedAt: null` filter on reads are handled by the global Prisma
> middleware (`prisma/middleware/prisma.softdelete.middleware.ts`), so admin item reads and
> `DELETE /:id` (converted to a soft delete) work without explicit filters.

---

## 3. Module files

`src/_modules/fortune-wheel/`:

| File | Responsibility |
|---|---|
| `fortune-wheel.module.ts` | Module wiring (controller + service). Registered in `app.module.ts`. |
| `fortune-wheel.controller.ts` | Admin CRUD + settings; customer eligibility / mark-shown / spin / my-rewards. |
| `fortune-wheel.service.ts` | Business logic (settings, eligibility, spin + weighted pick, rewards). |
| `dto/fortune-wheel.dto.ts` | DTOs (item create/update/filter/sort, settings update, reward filter). |
| `prisma-args/fortune-wheel.prisma.args.ts` | Reusable Prisma select/where/order args. |

Checkout redemption lives in the **order** module:
- `src/_modules/order/services/helpers.service.ts` — `verifyFortuneReward()` / `consumeFortuneReward()`.
- `src/_modules/order/order.service.ts` — applies the reward in `calculateOrder` and consumes it
  inside the order-creation transaction.
- `src/_modules/order/dto/order.dto.ts` — `fortuneRewardId?` added to `CalculateOrderDTO`.

---

## 4. Authorization

- Permission prefix `fortune-wheel` registered in
  `src/_modules/authorization/providers/permissions.provider.ts` and granted to the admin role in
  `roles/admin.role.provider.ts` (`['post', 'get', 'patch', 'delete']`).
- Admin endpoints use `@Auth({ prefix })` (permission-guarded).
- Customer endpoints use `@Auth()` (any authenticated user; needs a real `userId`).
  - Note: this is not role-scoped to customers — any authenticated `User` can hit
    `/eligibility`, `/mark-shown`, `/spin`, `/my-rewards`. Tighten to the customer role if that
    becomes a concern.
- Routing note: static routes (`/settings`, `/eligibility`, `/mark-shown`, `/spin`, `/my-rewards`)
  are declared **before** the `/:id` routes so the `:id` param doesn't capture them.

---

## 5. Endpoints

Base prefix: `/api/fortune-wheel`

**Admin — global settings**
- `GET /settings` — returns settings; auto-creates a default row (`displayIntervalHours = 24`,
  `isEnabled = true`) on first call if none exists.
- `PATCH /settings` — body `{ displayIntervalHours (required, >= 1), isEnabled? }`; creates default
  if missing, then updates and returns it.

**Admin — reward item CRUD**
- `POST /` — create item `{ displayName, rewardType, rewardValue?, weight?, maxDiscount?,
  minOrderAmount?, maxOrderAmount?, rewardExpiryHours?, isActive?, sortOrder? }`. `sortOrder`
  defaults to `max(sortOrder) + 1` when omitted.
- `GET /` and `GET /:id` — list (paginated, filterable by `id`/`displayName`/`rewardType`/
  `isActive`, sortable) / single.
- `PATCH /:id` — update item.
- `PATCH /:id/toggle-status` — flip `isActive`.
- `DELETE /:id` — soft-delete item.

**Customer — display gating, spin, rewards**
- `GET /eligibility` — returns:
  ```json
  { "shouldShow": true, "nextEligibleAt": null, "displayIntervalHours": 10,
    "items": [ { "id": 1, "displayName": "...", "rewardType": "DISCOUNT", "rewardValue": 10,
                 "weight": 1, "maxDiscount": null, "minOrderAmount": null,
                 "maxOrderAmount": null, "rewardExpiryHours": 24 } ] }
  ```
  `shouldShow` is `false` (and `items` empty) when the wheel is disabled, there are no active
  items, or `now < nextEligibleAt`.
- `POST /mark-shown` — stamps `lastShownAt = now` only (analytics). Does **not** advance
  `nextEligibleAt`; only a spin advances the window. Server time only. Upserts the user state.
- `POST /spin` — server-authoritative spin (see §6.2). Returns the won item and, on a win, the
  persisted reward id + expiry.
- `GET /my-rewards` — paginated list of the user's rewards, filterable by
  `status` = `valid | used | expired` (expiry computed lazily by `expiresAt`).

---

## 6. Eligibility & spin logic

### 6.1 Eligibility (`GET /eligibility`)

```
settings = getOrCreateSettings()
items    = active, non-deleted items (ordered by sortOrder, createdAt)
if !settings.isEnabled OR items.length == 0  -> shouldShow = false, items = []
state    = userState(userId)
eligible = !state.nextEligibleAt OR now >= state.nextEligibleAt
shouldShow = eligible   // when eligible, items are returned; otherwise nextEligibleAt is returned
```

The countdown is keyed off the **spin**, not the show. `markShown` only records `lastShownAt`.

### 6.2 Spin (`POST /spin`) — runs in a single transaction

1. Settings must be enabled and at least one active item must exist (else `400`).
2. Compute `nextEligibleAt = now + displayIntervalHours`.
3. **Idempotent single-spin guard:**
   - Ensure a `FortuneWheelUserState` row exists (`create`, catching Prisma `P2002` duplicate-key).
   - Conditional `updateMany` where `userId` AND (`nextEligibleAt IS NULL` OR `nextEligibleAt <= now`),
     setting `lastSpunAt = now`, `nextEligibleAt = computed`. If `count === 0` → `409 Not eligible yet`.
   - Under MySQL row locking this serializes concurrent double-taps: only the first caller wins the
     window; the rest get `409`.
4. **Weighted pick** (`weightedPick`): probability proportional to `weight` (negative weights
   clamped to 0); if the total weight is 0, falls back to a uniform pick.
5. If the won item's `rewardType` is `NONE` → return `{ isWin: false, wonItem, reward: null }`
   (nothing persisted).
6. Otherwise compute `expiresAt = rewardExpiryHours ? now + rewardExpiryHours : null`, create a
   `FortuneWheelUserReward` snapshot (`status = VALID`), and return
   `{ isWin: true, wonItem, reward: { id, expiresAt } }`.

### 6.3 Item payload rules

`validateItemPayload` (on create, and on update when `rewardType`/`rewardValue` is present):
- `DISCOUNT` → `rewardValue` required, must be `1..100` (percent); `maxDiscount`, if present, `> 0`.
- `FIXED_AMOUNT` → `rewardValue` required, `> 0`.
- `minOrderAmount <= maxOrderAmount` when both present.

`normalizeItemPayload`: for `FREE_DELIVERY` / `NONE` / `CUSTOM`, `rewardValue` is forced to `null`.

---

## 7. Checkout redemption

A customer passes `fortuneRewardId` on the order DTO. Two phases, mirroring coupons:

### 7.1 Validation & pricing — `calculateOrder` → `verifyFortuneReward`

`verifyFortuneReward(rewardId, userId, subtotalAfterCoupon, orderType, deliveryFeeExclTip)`:
- Rejects: reward not found, not owned by the user, not `VALID`, expired, or order subtotal outside
  `[minOrderAmount, maxOrderAmount]`.
- Computes the effect by type:
  - `DISCOUNT` → `floor(subtotalAfterCoupon * rewardValue / 100)`, capped at `maxDiscount`.
  - `FIXED_AMOUNT` → `rewardValue` off the subtotal.
  - `FREE_DELIVERY` → requires `deliveryFeeExclTip > 0` (else `400`); the caller zeroes the delivery
    fee but **preserves the tip** (`adjustedDeliveryPrice = tip`). `deliveryFeeExclTip` is `0` for
    `PICKUP`, so free delivery can't be applied to pickup orders.
  - `CUSTOM` (and any other) → `400` "cannot be redeemed at checkout" (display / admin-fulfilled only).
- Pricing combines coupon + reward: `combinedDiscount = couponDiscount + rewardDiscount`,
  `discountedSubtotal = max(0, subtotal - combinedDiscount)`,
  `finalTotal = discountedSubtotal + tax + adjustedDeliveryPrice`. With no reward, the math reduces
  to the original formula.

### 7.2 Consumption — inside the order transaction → `consumeFortuneReward`

`consumeFortuneReward(tx, rewardId, userId, orderId)` runs inside the same transaction that creates
the order (both the normal and archived-order paths). It does a conditional `updateMany`
(`status = VALID` AND not expired) → `status = USED`, `redeemedAt = now`,
`redeemedOrderId = orderId`. If `count === 0` it throws `409 Reward no longer available`. This makes
redemption atomic with order creation and prevents the same reward from being double-spent across
two simultaneous orders.

---

## 8. Integrity guarantees

- **Idempotent spin** — one win per display window, enforced by the conditional `updateMany` guard
  under row locking. Double-taps get `409`.
- **Atomic redemption** — the reward is consumed in the order-creation transaction with a
  conditional update; it cannot be spent twice.
- **Snapshotted rewards** — a won reward stores its own copy of type/value/limits, so later admin
  edits or deletes of the source item don't alter an outstanding prize.

---

## 9. Future considerations

- **Role-scope the customer endpoints** to the customer role if non-customers (drivers, store
  owners) holding tokens should not be able to spin (§4).
- **`CUSTOM` rewards** are not redeemable at checkout; define an admin-fulfilment flow if they are
  meant to be more than display segments.
- **`FortuneWheelRewardStatus.EXPIRED`** is currently unused (expiry is lazy by date). A cron sweep
  could materialize it if reporting needs a hard status.
- **Settings singleton** — `getOrCreateSettings` does `findFirst` + `create` with no unique
  constraint; two concurrent first-ever calls could create duplicate rows (harmless, since reads
  use `orderBy: { id: 'asc' }`). Add a singleton guard if that matters.
