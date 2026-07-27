# Pricing, Sizes & Commission — Implementation Reference

How service pricing, sizes/add-ons, and the two commission types work in the Makanak
backend, as currently implemented. This reflects the financial refactor that introduced
**independent global and store commissions** on top of the earlier size-pricing fix.

## Status

| Item | Status |
|---|---|
| Selected size price used in order calculation (no double-count) | **Done** |
| `priceWithDefaultOptions` counts commission once (never base + size) | **Done** |
| Size prices returned commission-inclusive (direct prices, not modifiers) | **Done** |
| Two independent commissions (store + global) | **Done** |
| PERCENTAGE **and** FIXED commission types (both kinds) | **Done** |
| Store commission base = base/size price, excludes add-ons | **Done** |
| Order responses expose `globalCommission` / `storeCommission` breakdown | **Done** |
| Optional discounted "sale" price on service **and** each size (`priceAfterDiscount`) | **Done** |
| Discount applied at the RAW layer → store commission still applied exactly once | **Done** |
| Service responses expose `effectivePrice` / `priceAfterDiscount` / `hasDiscount` | **Done** |
| List view loads sizes so the headline matches what checkout charges | **Done** |

---

## 1. Overview

Two pricing concerns, kept strictly separate:

- **Service pricing & sizes** — what a single item costs before any order-level fees.
- **Commission** — two *independent* markups that are never double-counted:
  1. **Store commission** — a per-store markup **baked into the client-facing price** of a
     service/size. Lives **inside** the items subtotal.
  2. **Global commission** — an admin platform fee applied **once per order**, **on top** of the
     subtotal (excludes delivery).

Both commission types support **PERCENTAGE** and **FIXED** (`CommissionType` enum).

---

## 2. How pricing is stored

### Service / item models (`prisma/schema/service.prisma`)
- `Service.price Float` — base net price, used when no size is selected.
- `Service.priceAfterDiscount Float?` — **optional** discounted base price (a "sale" price). `NULL`
  ⇒ not on sale. Validated `0 ≤ priceAfterDiscount < price` (see §4.1).
- `ServiceSize.price Float` — the **complete net price** for that size (see §3). One value per size,
  there is no separate "modifier"/"delta" field.
- `ServiceSize.priceAfterDiscount Float?` — **optional** discounted price for that size; this is the
  one that actually drives checkout when the size is selected. `NULL` ⇒ not on sale.
- `ServiceAddon.price Float` — flat net addition per add-on. Add-ons are **never** discounted.
- `Service.commission Float?` — legacy/dead field, **never read**. Commission lives on the Store.

### Store commission (`prisma/schema/store.prisma`)
- `Store.commission Float @default(0)` — the commission value.
- `Store.commissionType CommissionType @default(FIXED)` — `PERCENTAGE` or `FIXED`.
- `Store.tax Float @default(0)` — per-store tax percentage (unchanged by this refactor).

### Global commission (`src/_modules/settings/settings.ts`, `Settings` table)
- `businessOrderCommissionRateForAll` (BOOLEAN, default `true`) — **global commission enabled**.
- `businessOrderCommissionRate` (NUMBER, default `0`) — the global commission **value**.
- `businessOrderCommissionType` (ENUM `PERCENTAGE`/`FIXED`, default `FIXED`) — the global mode.

> ⚠️ Semantics note: `businessOrderCommissionRateForAll` now means **"global commission on/off"**.
> (Before the refactor it meant "use global *instead of* store" — the two are now independent.)

### Order persistence (`prisma/schema/order.prisma` — `Order` and `ArchivedOrder`)
- `price` — items **subtotal** (store commission included, global excluded).
- `globalCommission` — global commission charged on this order.
- `storeCommission` — total store commission baked into this order's items.
- `adminCommission` — admin/platform earning = `globalCommission + storeCommission` (drives the wallet split).
- `shipping` — delivery fee. `tax` — tax amount. `discountAmount` — coupon + reward.
- `totalPriceAfterDiscount` — final payable amount.

### `CommissionType` enum (`prisma/schema/enum.prisma`)
```prisma
enum CommissionType { PERCENTAGE  FIXED }
```

---

## 3. Size & add-on pricing rules

- **`ServiceSize.price` is a complete net price**, not a delta/modifier/increment. When a size is
  selected, its price **fully replaces** `Service.price` — the two are **never summed**.
- **Base price** for any unit is the **effective (post-discount) raw price** — the discounted price
  when valid, otherwise the original price (see §4.1):
  ```ts
  basePrice = effectiveRawPrice(
    selectedSize ? selectedSize.price            : service.price,
    selectedSize ? selectedSize.priceAfterDiscount : service.priceAfterDiscount,
  )
  ```
- **Add-ons are additive** and never receive commission:
  ```ts
  unitNetPrice = basePrice + addonsPrice
  ```
- **Quantity** multiplies the full unit price (after commission):
  ```ts
  lineTotal = unitPrice * quantity
  ```

`validateSizeAndAddons` (`src/_modules/order/services/helpers.service.ts`) resolves this and returns
`basePrice` (selected size price, or `service.price` fallback) and `addonsPrice` **separately**, so
commission can be applied to the base only.

---

## 4. Store commission (service-level)

Applied to the **base price only** (service price or selected size price), **per unit**, then × qty.
Add-ons are excluded. Helper: `ServiceModuleHelper.applyStoreCommission(basePrice, store)`.

| Type | Formula | Example (base 100) |
|---|---|---|
| `PERCENTAGE` | `base + base * commission / 100` | 10% → **110** |
| `FIXED` | `base + commission` | 5 → **105** |

Returns `{ clientFacingPrice, storeCommissionPerUnit }`.

**Where it surfaces (display, `mapServiceObject`):**

| Field in service response | Commission applied? | Notes |
|---|---|---|
| `price` (top-level) | Yes | `applyStoreCommission(service.price)` — original list price |
| `priceAfterDiscount` (top-level) | Yes | `applyStoreCommission(service.priceAfterDiscount)`, or `null` when not on sale |
| `effectivePrice` (top-level) | Yes, **once** | what the base costs now = `priceAfterDiscount ?? price` |
| `hasDiscount` (top-level) | — | `true` iff the base has a valid discount |
| `Sizes[].price` | Yes | each size's original commission-inclusive price |
| `Sizes[].priceAfterDiscount` | Yes | each size's discounted commission-inclusive price, or `null` |
| `Sizes[].effectivePrice` | Yes, **once** | what that size costs now = its `priceAfterDiscount ?? price` |
| `Sizes[].hasDiscount` | — | per-size sale flag |
| `priceWithDefaultOptions` | Yes, **once** | `defaultSize ? defaultSize.effectivePrice : baseEffectivePrice` — the **default size's discounted** price, so it equals what checkout charges |
| `Addons[].price` | **No** | raw net value |
| `commission`, `commissionType` | — | the store's configured value + mode, exposed for transparency |

Display examples (store 10%): service 100 → `110`; Small=100/Large=150 → sizes `[110, 165]`.
Store FIXED 5: service 100 → `105`, size 150 → `155`.

---

## 4.1 Price after discount (sale price)

An **optional absolute "sale" price** on a service and/or each size. Admins set it to put an item
on sale; customers see and pay the discounted price. It is **not** a percentage, coupon, or
time-limited promo — those are separate systems.

### Two levels, one rule
- `Service.priceAfterDiscount` — discounts the **base/headline** price (the no-size path, and the
  top-level `price`/`effectivePrice` in responses).
- `ServiceSize.priceAfterDiscount` — discounts a **specific size**. Because a selected size's price
  *replaces* the base at checkout, **the size-level discount is the one that actually changes what a
  customer pays** when they pick that size.

### Effective-price rule (single source of truth)
Two pure helpers on `ServiceModuleHelper`, reused by **both** the serialization and checkout
pipelines so display and checkout can never diverge:
```ts
hasValidDiscount(price, pad) => pad != null && pad >= 0 && pad < price
effectiveRawPrice(price, pad) => hasValidDiscount(price, pad) ? pad : price
```
- The discount is chosen at the **RAW (pre-commission) layer**, *before* `applyStoreCommission`, so
  **store commission is still applied exactly once** — never to an already-commission-inclusive
  value. `effectivePrice = applyStoreCommission(effectiveRawPrice(price, pad))`.
- **Defensive guard:** `hasValidDiscount` rejects `pad >= price` and `pad < 0`, so a corrupted row
  (seed, manual SQL, future migration) silently falls back to `price` — never throws, never
  under/over-charges. This complements the DTO validation (it is not a replacement).
- `NULL` (the overwhelming majority of rows) ⇒ `effective = price` ⇒ **byte-for-byte unchanged**
  behavior. No backfill.

### Validation (write path)
- `priceAfterDiscount` is optional; when present it must be `>= 0` and `< price`.
  - Negatives are rejected eagerly (`@ValidateNumber` / `@ValidateNullableNumber`,
    `allowNegative:false`).
  - `< price` enforced by the cross-field `@LessThanField('price')` validator
    (`src/decorators/dto/validators/less-than-field.decorator.ts`).
- **Clearing the service-level discount on PATCH:** `@ValidateNullableNumber`
  (`src/decorators/dto/validators/validate-nullable-number.decorator.ts`) distinguishes *absent key*
  (`undefined` ⇒ Prisma no-op) from *present-but-empty* (`null` ⇒ column cleared).
- **Clearing a size discount:** sizes are deleted + recreated on every service update, so simply
  omitting `priceAfterDiscount` in the new size recreates the row with `NULL` — no stale discount.

### Consistency: list vs detail vs checkout
`selectServiceOBJ` (list) **also selects `Sizes`** so `priceWithDefaultOptions` / `hasDiscount` are
derived from the **default size** — i.e. exactly what checkout charges. Without this, a service with
a base-level discount but an undiscounted default size would advertise the discounted base price in
listings while checkout charged the full size price ("see 120, pay 150"). The base-level
`price`/`effectivePrice` remain the "starting from" headline; `priceWithDefaultOptions` is the
purchasable default-options price.

### Discount display examples (store 10%, PERCENTAGE)
```
service price 150, priceAfterDiscount 120
  → price 165, priceAfterDiscount 132, effectivePrice 132, hasDiscount true
size price 200, priceAfterDiscount 150 (default)
  → price 220, priceAfterDiscount 165, effectivePrice 165, hasDiscount true
  → priceWithDefaultOptions 165 (= checkout unit for that size)
no discount (pad NULL)
  → price 165, priceAfterDiscount null, effectivePrice 165, hasDiscount false
```

---

## 5. Global commission (order-level)

Admin platform fee, applied **once per order** on the **items subtotal** (which already includes
store commission), **excluding delivery**, added **on top** of the subtotal.

Helpers: `getGlobalCommissionSettings()` → `{ enabled, type, value }`;
`calculateGlobalCommission(subtotal, settings)`.

| Type | Formula | Example (subtotal 1000) |
|---|---|---|
| `PERCENTAGE` | `subtotal * value / 100` | 2% → **20** |
| `FIXED` | `value` | 25 → **25** |
| disabled | `0` | — |

---

## 6. Order calculation flow (`order.service.ts` → `calculateOrder`)

```
for each item:
  basePrice          = effectiveRawPrice(selSize?.price ?? service.price,  // validateSizeAndAddons
                                          selSize?.priceAfterDiscount ?? service.priceAfterDiscount)
  { clientFacingPrice, storeCommissionPerUnit } = applyStoreCommission(basePrice, store)
  unitPrice          = clientFacingPrice + addonsPrice                     // add-ons, no commission
  finalItemPrice     = unitPrice * quantity
  totalStoreCommission += storeCommissionPerUnit * quantity

subtotal           = Σ finalItemPrice                 // store commission inside, global excluded
globalCommission   = calculateGlobalCommission(subtotal, settings)        // once, pre-discount
tax                = getTax(subtotal, store.tax)                          // unchanged
delivery           = getDeliveryPrice(...) (+ tip)    // 0 for PICKUP
discount           = coupon + fortune-wheel reward
finalTotal         = max(0, subtotal − discount) + tax + delivery + globalCommission
adminCommission    = globalCommission + totalStoreCommission
```

Order math summary:
```
finalPayable   = max(0, subtotal − discount) + tax + delivery + globalCommission
adminCommission = globalCommission + Σ (storeCommissionPerUnit * qty)
branchEarning   = totalPriceAfterDiscount − adminCommission − shipping     // store keeps the base
```

`create` and `createArchivedOrder` persist `adminCommission`, `globalCommission`, `storeCommission`,
and write the breakdown into the `invoice.summary` (`subtotal`, `tax`, `shipping`, `discount`,
`globalCommission`, `storeCommission`, `commission` = admin, `total`).

---

## 7. Custom-delivery orders (`calculateCustomDeliveryOrder` / `createCustomDeliveryOrder`)

No store and no services, so **no store commission**. Global commission applies to the
`estimatedItemsCost`:
```
subtotal        = estimatedItemsCost
globalCommission = calculateGlobalCommission(subtotal, settings)
extraStopFee     = max(0, stops.length − 2) * customDeliveryExtraStopPrice
adminCommission  = globalCommission + extraStopFee
total            = subtotal + adminCommission + delivery + tip
```
Persisted: `globalCommission`, `storeCommission = 0`, `adminCommission`, `tax = 0`. The invoice
summary exposes `globalCommission`, `extraStopFee`, `commission` (= admin), `shipping`, `total`.

---

## 8. API responses

- **Order responses** (`selectOrderOBJ`, `order.helpers.prisma.arg.ts`, invoices): expose
  `price` (subtotal), `globalCommission`, `storeCommission`, `adminCommission`, `shipping`, `tax`,
  `discountAmount`, `totalPriceAfterDiscount` (final payable). No fields removed.
- **Service responses** (`selectServiceOBJ` selects `Store.commissionType` **and now `Sizes`**;
  `mapServiceObject`): `price` and `Sizes[].price` are client-facing; each also exposes
  `priceAfterDiscount`, `effectivePrice`, `hasDiscount`; `priceWithDefaultOptions` reflects the
  default size's effective price; `commission` + `commissionType` exposed.
- **Store responses** (`selectStoreOBJ`): include `commission` and `commissionType`.

---

## 9. Admin configuration

- **Per-store:** `PATCH /stores/:id/commission` body `{ commission, commissionType }`.
  `store.service.updateCommission` enforces `commission ≤ 100` **only** when `PERCENTAGE`
  (FIXED is uncapped).
- **Global:** `PATCH /settings` — set `businessOrderCommissionRateForAll` (on/off),
  `businessOrderCommissionRate` (value), `businessOrderCommissionType` (PERCENTAGE/FIXED).

---

## 10. Wallet / earnings split (unchanged)

`wallet.service.ts:distributeEarnings` (at `DELIVERED`) is **untouched** — only the value fed into
`adminCommission` changed:
```
branchEarning = totalPriceAfterDiscount − adminCommission − shipping
```
Admin wallet receives `adminCommission` (= global + store commission); the branch keeps the base
item prices (+ tax − discount). Because store commission is now admin revenue, the platform
collects both commissions while the store still receives the net price it set.

---

## 11. Migration & defaults

- Schema pushed via `prisma db push` (no migration history). New columns are defaulted →
  backward-compatible; historical orders read `0` for `globalCommission`/`storeCommission`
  (their `adminCommission` and totals are unchanged).
- **`commissionType` defaults are `FIXED`** (both `Store.commissionType` and the
  `businessOrderCommissionType` setting). The pre-refactor code added commission as a flat amount,
  so defaulting to FIXED preserves the **exact legacy behavior** for existing stores and any
  existing global rate — **no admin action required**. Switch a store (or the global setting) to
  `PERCENTAGE` only when percentage-based commission is wanted.

---

## 12. Worked examples (mirrors the unit tests)

```
Store display:
  service 100, store 10%                         → price 110
  size 150, store 10%                            → size price 165
  size 150, store FIXED 5                        → size price 155

Order lines (store commission on base, not add-ons):
  large 150 @10% + addon 20, qty 2              → unit 185, line 370, storeCommission 30
  base 100 FIXED 5 + addon 20, qty 3            → unit 125, line 375, storeCommission 15

Full order:
  subtotal 1000, delivery 50, global 2%         → globalCommission 20, total 1070, admin 20
  subtotal 1000, delivery 50, global FIXED 25   → globalCommission 25, total 1075, admin 25
  base 1000 store 10% + global 2%, delivery 50  → subtotal 1100, global 22, total 1172,
                                                   admin 122 (22 + 100), branch 1000
```

Exercised by `src/_modules/order/__test__/pricing-commission.spec.ts` (24 tests).

---

## 13. File map

| File | Role |
|---|---|
| `prisma/schema/enum.prisma` | `CommissionType` enum |
| `prisma/schema/store.prisma` | `Store.commission`, `Store.commissionType` |
| `prisma/schema/order.prisma` | `Order`/`ArchivedOrder`: `adminCommission`, `globalCommission`, `storeCommission` |
| `prisma/schema/service.prisma` | `Service`, `ServiceSize`, `ServiceAddon` (+ `priceAfterDiscount`) |
| `src/_modules/serviceModule/services/serviceModule.helper.service.ts` | `hasValidDiscount`, `effectiveRawPrice`, `applyStoreCommission`, `getGlobalCommissionSettings`, `calculateGlobalCommission`, `mapServiceObject` |
| `src/_modules/serviceModule/dto/service.dto.ts`, `dto/size.dto.ts` | `priceAfterDiscount` DTO fields + validation |
| `src/decorators/dto/validators/less-than-field.decorator.ts` | cross-field `@LessThanField('price')` |
| `src/decorators/dto/validators/validate-nullable-number.decorator.ts` | `@ValidateNullableNumber` (absent vs present-empty ⇒ clearable column) |
| `src/_modules/serviceModule/prisma-args/service.prisma.args.ts` | service selects (expose `Store.commissionType`) |
| `src/_modules/serviceModule/interfaces/service.interface.ts` | `ServiceDTO` (`commission`, `commissionType`) |
| `src/_modules/order/services/helpers.service.ts` | `validateSizeAndAddons` (returns `basePrice` + `addonsPrice`), `getTax`, delivery |
| `src/_modules/order/order.service.ts` | `calculateOrder`, `create`, `createArchivedOrder`, custom-delivery calc/create |
| `src/_modules/order/prisma-args/*.ts` | order selects expose `globalCommission`/`storeCommission` |
| `src/_modules/store/dto/store.dto.ts` | `UpdateStoreCommissionDTO` (`commission`, `commissionType`) |
| `src/_modules/store/services/store.service.ts` | `updateCommission` (range check) |
| `src/_modules/store/prisma-args/store.prisma.args.ts` | `selectStoreOBJ` (exposes `commissionType`) |
| `src/_modules/settings/settings.ts` | `businessOrderCommissionRateForAll`, `businessOrderCommissionRate`, `businessOrderCommissionType` |
| `src/_modules/wallet/wallet.service.ts` | `distributeEarnings` (unchanged; reads `adminCommission`) |

---

## 14. History

- **Size-price bug (fixed earlier):** `validateSizeAndAddons` previously returned only `addonsPrice`
  and `calculateOrder` did `(service.price + selected.totalPrice) * qty`, so the selected size was
  ignored / the base double-counted. Now the selected size replaces the base correctly.
- **Flat-only rule (superseded):** an in-repo note dated 2026-06-06 stated commission was a flat
  amount "never a percentage". The financial refactor introduced both PERCENTAGE and FIXED types
  (confirmed with stakeholder). The net-price semantics of `ServiceSize.price` and per-unit
  application still hold.
- **Price after discount (added):** optional `priceAfterDiscount` on `Service` and `ServiceSize`.
  Injected at the raw layer so commission stays applied once; effective price is
  `priceAfterDiscount ?? price` behind a validity guard. `selectServiceOBJ` was extended to load
  `Sizes` so list listings can't advertise a price the checkout won't honor. Covered by
  `src/_modules/serviceModule/__test__/price-after-discount.spec.ts` and
  `src/_modules/order/__test__/checkout-price-after-discount.spec.ts`.
