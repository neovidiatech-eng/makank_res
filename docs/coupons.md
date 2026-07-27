# Coupons & Discounts

## Overview

Coupons are admin-managed discount codes a customer applies at checkout. A coupon is created in the
admin dashboard, optionally targeted (per user / store) and now **optionally restricted to delivery
zones**, then entered by the customer during order calculation/creation.

Validation is centralized: every code goes through **one** chokepoint —
`calculateOrder → verifyCoupon → isCouponValid` — used by both the **checkout preview**
(`POST /orders/calculate/order`) and **order creation** (`POST /orders`). There is no second,
divergent validation path, so a coupon behaves identically in preview and at creation.

> All routes below are under the global prefix **`/api`** and require a **Bearer access token**
> (`Authorization: Bearer <token>`). Admin coupon CRUD requires the `coupons` permission.

---

## Data model

```
Coupon ──< CouponZones >── Zone        (zone restriction, many-to-many)
Coupon ──< StoreCoupons >── Store      (STORE_WISE targeting)
Coupon ──< UserCoupons  >── User       (USER_WISE targeting)
```

### Coupon fields

| Field | Type | Notes |
|---|---|---|
| `code` | string (unique) | The code the customer enters. |
| `title` | JSON `{ ar, en }` | Display name. |
| `type` | `CouponType` | Targeting scope (see below). |
| `discountType` | `AMOUNT` \| `PERCENTAGE` | How `discountValue` is interpreted. |
| `discountValue` | int | Fixed amount, or percent when `PERCENTAGE`. |
| `maxDiscountValue` | int | **Caps** the discount for `PERCENTAGE`. |
| `minDiscountValue` | int | Stored for admin reference (not enforced in pricing). |
| `minOrderAmount` | int | Minimum **items subtotal** required to use the coupon. |
| `maxUsage` / `usageCount` | int | Global usage limit and current count. |
| `active` | bool | Master on/off switch. |
| `startDate` / `endDate` | datetime | Validity window. |
| `expired` | bool | Set by an hourly cron when `endDate` passes (also flips `active` off). |

### Coupon types (`type`)

| Value | Meaning |
|---|---|
| `ALL_USERS` | Any customer. |
| `FIRST_ORDER` | Only if the customer has not already used this coupon. |
| `USER_WISE` | Only customers linked via `userIds`. |
| `ALL_STORES` / `STORE_WISE` | All stores / only stores linked via `storeIds`. |

---

## Zone restriction (optional)

A coupon can be limited to one or more **delivery zones**.

- **No zones linked → global**: the coupon works in every zone (and for `PICKUP`).
- **One or more zones linked → restricted**: the coupon is valid **only** when the order's resolved
  delivery zone is one of them.

### How the order's zone is resolved

The zone is the same `Order.zoneId` used everywhere else for serviceability — resolved from the
delivery coordinates by point-in-polygon over the active zones:

| Order type | Coordinates used | Resulting `zoneId` |
|---|---|---|
| `DELIVERY` | The selected `Address` (`addressId → lat/lng`) | matching zone, or `null` if outside all zones |
| `PICKUP` | none | always `null` |

**Rule:** a zone-restricted coupon requires a **matching, non-null** zone.
A `null` zone (PICKUP, no address yet, or an address outside every active zone) is **rejected**.
Global coupons are unaffected by zone and pass even when `zoneId` is `null`.

---

## Validation rules (in order)

`isCouponValid` rejects with a `400` and one of these messages:

| Check | Error message |
|---|---|
| Code not found | `Coupon not found` |
| `active === false` | `Coupon is not active` |
| `now < startDate` | `Coupon has not started yet` |
| `now > endDate` | `Coupon has expired` |
| `usageCount >= maxUsage` | `Coupon usage limit has been reached` |
| `subtotal < minOrderAmount` | `Coupon cannot be used with this order amount because of minOrderAmount` |
| `USER_WISE` and customer not linked | `Coupon is not valid for this user` |
| `STORE_WISE` and store not linked | `Coupon is not valid for this user` |
| `FIRST_ORDER` and already used | `Coupon is not valid for this user` |
| **Zone-restricted and zone doesn't match (incl. `null`)** | **`Coupon is not valid for this delivery zone`** |

At **order creation**, the coupon is re-checked atomically and `usageCount` is incremented; if it was
exhausted/expired in the meantime the request fails with `409 Coupon is no longer available`.

### Discount calculation

Applied to the **items subtotal** (includes per-store commission; excludes tax, delivery, and the
global platform commission):

- `AMOUNT` → `discountValue`, **clamped so it can never exceed the subtotal** (no negative totals).
- `PERCENTAGE` → `subtotal × discountValue / 100`, **capped at `maxDiscountValue`**.

The final order total is `max(0, subtotal − discount) + tax + delivery + globalCommission`.

---

## Admin API

Base: `/api/coupons` (permission: `coupons`).

### Create — `POST /api/coupons`

```jsonc
{
  "title": { "ar": "خصم", "en": "Save" },
  "code": "SAVE20",
  "type": "ALL_USERS",
  "discountType": "PERCENTAGE",
  "discountValue": 20,
  "maxUsage": 100,
  "usageCount": 0,
  "minOrderAmount": 100,
  "startDate": "2026-06-11T00:00:00.000Z",
  "endDate": "2026-06-30T00:00:00.000Z",
  "minDiscountValue": 0,
  "maxDiscountValue": 50,

  // Optional targeting:
  "userIds": [],            // required only for USER_WISE
  "storeIds": [],           // required only for STORE_WISE

  // Optional zone restriction — omit/empty = global:
  "zoneIds": [1, 2],

  // Optional push to customers on creation:
  "notificationTitle": { "ar": "...", "en": "..." },
  "notificationDescription": { "ar": "...", "en": "..." }
}
```

`zoneIds` are validated against existing zones — **unknown zone IDs are rejected** (not ignored).

### Update — `PATCH /api/coupons/:id`

All fields are optional. **`zoneIds` has explicit semantics:**

| `zoneIds` in body | Effect on zone restriction |
|---|---|
| omitted | **kept unchanged** |
| `[]` (empty) | **cleared** → coupon becomes global |
| `[3, 4]` | **replaced** with exactly those zones |

```jsonc
{ "discountValue": 15 }      // updates discount, keeps existing zones
{ "zoneIds": [] }            // clears zone restriction (global)
{ "zoneIds": [3] }           // restricts to zone 3 only
```

### Fetch — `GET /api/coupons` (list) · `GET /api/coupons/:id` (single)

Responses include the zone restriction so admins can see it at a glance:

```jsonc
{
  "id": 100,
  "code": "AMROSY14",
  "type": "ALL_USERS",
  "discountType": "AMOUNT",
  "discountValue": 5,
  // ...
  "CouponZones": [
    { "zoneId": 1, "Zone": { "id": 1, "name": { "ar": "منطقة 1", "en": "Zone 1" } } },
    { "zoneId": 2, "Zone": { "id": 2, "name": { "ar": "منطقة 2", "en": "Zone 2" } } }
  ]
}
```

An empty `CouponZones` array means the coupon is **global**.

### Delete — `DELETE /api/coupons/:id`

---

## Customer / order API

### List the customer's available coupons — `GET /api/users/me/coupon`

Returns active `ALL_USERS` + the caller's `USER_WISE` coupons (`{ id, code, title }`). This is a
display list only — eligibility (zone, min order, usage, dates) is enforced at checkout, **not**
here. Do not assume a listed coupon will apply to the current cart.

### Preview with a coupon — `POST /api/orders/calculate/order`

```jsonc
{
  "couponCode": "AMROSY14",
  "items": [ { "serviceId": 47, "quantity": 2 } ],
  "addressId": 1,          // drives the delivery zone
  "branchId": 47,
  "type": "DELIVERY",
  "tip": 0
}
```

Relevant response fields:

```jsonc
{
  "subtotal": 114,
  "discountValue": 5,        // combined coupon + reward discount
  "totalPrice": 124,         // final payable total
  "couponId": 100,           // null when no coupon applied
  "zoneId": 1,               // resolved delivery zone (null for PICKUP / no match)
  "tax": 0,
  "shipping": 15
}
```

A coupon failure returns `400` with one of the messages in the table above; the preview does **not**
silently drop an invalid coupon.

### Create the order — `POST /api/orders`

Send `couponCode` again (plus `paymentMethod`, etc.). The backend re-validates, applies the discount,
and increments `usageCount` atomically. Handle `409 Coupon is no longer available`.

---

## Frontend / mobile integration guide

### Recommended flow

1. **List coupons** (optional) via `GET /users/me/coupon`, or let the user type a code.
2. **Require a delivery address first** for `DELIVERY` carts, then call
   `POST /orders/calculate/order` with `couponCode`, `addressId`, `branchId`, `type`, `items`.
3. Show `discountValue` and the new `totalPrice` from the response.
4. On **address change**, **re-call** `calculate/order` — the coupon's validity can change because
   zone-restricted coupons depend on the delivery zone (see below).
5. On checkout, call `POST /orders` with the same `couponCode`. On `409`, tell the user the coupon is
   no longer available and refresh the price without it.

### ⚠️ Zone restriction & address timing (important)

A zone-restricted coupon is validated against the **selected delivery address's zone**:

- If the user applies a zone-restricted coupon **before** picking an address (or for `PICKUP`), the
  zone is `null` and the API returns **`Coupon is not valid for this delivery zone`**. This is
  expected — treat it as *"select a delivery address first,"* not as a hard "invalid coupon."
- After the address is selected/changed, **re-validate** by calling `calculate/order` again.
- **Global coupons** (no zone restriction) are never affected by this and work for any address and
  for `PICKUP`.

There is no client-visible flag distinguishing global vs zone-restricted coupons in the customer
endpoints; rely on the `calculate/order` result for the selected address as the source of truth.

### Error message reference

| HTTP | Message | Suggested client handling |
|---|---|---|
| 400 | `Coupon not found` | Invalid code — clear the field, show "Invalid coupon". |
| 400 | `Coupon is not active` / `Coupon has expired` / `Coupon has not started yet` | Show "This coupon isn't available." |
| 400 | `Coupon usage limit has been reached` | Show "This coupon is fully redeemed." |
| 400 | `Coupon cannot be used with this order amount because of minOrderAmount` | Show the minimum-order hint; keep the cart, drop the discount. |
| 400 | `Coupon is not valid for this user` | Show "This coupon isn't valid for your account." |
| 400 | `Coupon is not valid for this delivery zone` | If no address selected → prompt to choose an address, then retry. Otherwise show "Not available in your area." |
| 409 | `Coupon is no longer available` | Re-fetch price without the coupon (raced/exhausted at checkout). |

---

## Worked example (current seed)

Coupon **`AMROSY14`**: `ALL_USERS`, `AMOUNT −5` (cap 5), `minOrderAmount 100`, zones **[1, 2]**,
valid `2026-06-11 → 2026-06-15`.

**Applies** (subtotal ≥ 100, address in zone 1/2):

```json
{
  "couponCode": "AMROSY14",
  "items": [ { "serviceId": 47, "quantity": 2 } ],
  "addressId": 1,
  "branchId": 47,
  "type": "DELIVERY",
  "tip": 0
}
```

**Rejected** (`type: "PICKUP"` → `zoneId = null` → `Coupon is not valid for this delivery zone`).
A global coupon would still pass in the same PICKUP case.

> Note: `addressId 1` resolves to zone 1; `branchId 47` is an open branch of service 47's store.
> Quantity 2 makes the subtotal (57 × 2 = 114) clear the `minOrderAmount` of 100.
