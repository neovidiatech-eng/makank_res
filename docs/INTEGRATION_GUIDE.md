# Makanak — Frontend & Mobile Integration Guide

> **Audience:** Frontend (admin / store dashboard) and Mobile (customer + driver apps) teams.
> **Purpose:** one consolidated guide to every client-facing feature — what each flow does, what you
> send, what you get back, and how to wire it up. This is a behavior-and-contract guide, not a
> backend internals doc. Verify final payloads against Swagger with a real token before shipping.

**Base URL:** every route is prefixed with **`/api`** (e.g. `POST /api/campaigns`).
**Swagger UI:** `http://localhost:3030/api/docs` — the live source of truth for request/response shapes.

**Surface legend:** 🛍️ Customer app · 🚚 Driver app · 🖥️ Admin / Store dashboard

**Conventions used throughout**
- **Bilingual fields** are JSON objects `{ "ar": "...", "en": "..." }`. Many name/title fields are
  bilingual; the API resolves them to the request locale, but some endpoints hand back the raw object —
  noted where relevant.
- **Image paths** come back as relative paths (e.g. `uploads/orders/x.jpg`). Prefix them with your
  asset base URL the same way you render any other upload.
- **Pagination envelope:** newer list endpoints return a canonical
  `pagination: { page, limit, total, totalPages }` object alongside a legacy top-level `total`.
  Prefer `pagination` for new UI.
- **Multipart endpoints:** anything with a file upload uses `multipart/form-data`; non-file fields are
  sent as form fields (and JSON-object fields like bilingual titles are sent as JSON strings).

---

## Table of Contents

1. [Orders — Pricing & Checkout](#1-orders--pricing--checkout)
2. [Custom Delivery — Multi-Station Errands](#2-custom-delivery--multi-station-errands)
3. [Custom Delivery — Station Images](#3-custom-delivery--station-images)
4. [Gift Orders](#4-gift-orders)
5. [Orders — City / Zone / Type Filters](#5-orders--city--zone--type-filters)
6. [Driver Assignment — Bulk Assign, Batch Accept & AFK Break](#6-driver-assignment--bulk-assign-batch-accept--afk-break)
7. [Driver Management Dashboard](#7-driver-management-dashboard)
8. [Fortune Wheel](#8-fortune-wheel)
9. [Campaigns — Notifications & Offers](#9-campaigns--notifications--offers)
10. [Banners](#10-banners)
11. [Logs (Audit Trail)](#11-logs-audit-trail)
12. [Breaking Changes — Migration Checklist](#12-breaking-changes--migration-checklist)
13. [Summary Table](#13-summary-table)

---

## 1. Orders — Pricing & Checkout

### How it works

Order pricing is computed server-side and returned by a **calculate** call (preview, creates nothing)
and again on **create**. The customer never computes totals locally — display the server's numbers
as-is. Pricing combines, in order: **Subtotal → Tax → Delivery → Discount (coupon + fortune reward)**.

```
POST /api/orders/calculate/order      → price breakdown, nothing created   🛍️
POST /api/orders                       → creates the order (multipart)       🛍️
```

### Calculate / create response

```jsonc
{
  "price": 200,               // subtotal (items, store commission already baked in)
  "totalPrice": 230,          // final payable = discounted subtotal + tax + delivery
  "priceAfterDiscount": 180,  // subtotal after coupon AND reward discount
  "priceAfterTax": 214,       // subtotal + tax
  "discountValue": 20,        // COMBINED coupon + fortune-reward discount (not itemized)
  "commission": 15,           // admin/platform commission portion
  "tax": 14,
  "shipping": 30,             // delivery fee incl. tip; becomes tip-only when a free-delivery reward applies
  "couponId": 3,
  "rewardId": 7,              // fortune reward consumed — present only when a reward was applied
  "items": [ /* validated items */ ]
}
```

### What the client must know

- **`discountValue` is combined** (coupon + reward). You cannot split it from this field alone. If
  your UI needs separate coupon vs. reward lines, show the coupon the user submitted and treat the
  remainder as the reward — or show a single "Discount" line.
- **Free-delivery reward keeps the tip.** When a free-delivery reward applies, the delivery fee is
  zeroed but the tip is preserved, so `shipping` becomes the tip amount (not 0). Display delivery as
  *free* while still charging the tip.
- **`rewardId`** echoes the consumed reward → show "reward applied".
- **Redeem a fortune reward** by sending `fortuneRewardId` on the calculate/create payload (see
  [Fortune Wheel](#8-fortune-wheel)). Pickup orders cannot use free-delivery rewards.
- **Do not recompute** financials client-side — the driver dashboard and invoices read persisted
  order values; display them directly.

### Pricing model (for display labels) 🖥️

Two commission types exist and are independent — useful only if the dashboard surfaces a breakdown:

- **Store commission** is *baked into* the item/size prices you already see (the customer-facing
  price). Add-ons never carry commission.
- **Global commission** is an admin platform fee added once per order, on top of the subtotal,
  excluding delivery.

Service responses expose `price`, `Sizes[].price` (both customer-facing, commission included),
`Addons[].price` (raw), and the store's `commission` / `commissionType` for transparency. Order
responses expose `globalCommission`, `storeCommission`, `adminCommission`, `shipping`, `tax`,
`discountAmount`, and `totalPriceAfterDiscount` (final payable). Selecting a size **replaces** the base
price — never add a size price on top of the base.

> The field is still named `tax` (a `tax → serviceFee` rename was discussed but **not** applied — do
> not rename client-side). `CUSTOM` fortune rewards are display-only and not redeemable at checkout.

---

## 2. Custom Delivery — Multi-Station Errands

### How it works 🛍️ 🚚

A **custom delivery** lets a customer hire a driver to run a multi-stop errand: visit one or more
**stations** (workshop, grocery, pharmacy…), buy/do something at each, then deliver everything to a
final drop-off. The driver works the stations **strictly in order**, one active step at a time, and
can only finish once every station has been reached.

This maps to the driver app's three tabs — **New**, **In Progress**, **History** — and a station
checklist UI ("Step 1 of 2", `Going to location` → `Reached`, `Move to next location`, `Finish Task`).

A custom-delivery order has **no store/branch**. It carries an ordered list of stations, a
distance-based delivery price, an admin commission, and an estimated items cost the customer either
pre-pays (wallet) or pays the driver on delivery (cash).

### Customer flow

**1. Preview the price** (creates nothing):
```
POST /api/orders/custom-delivery/calculate
```

**2. Create the order** (multipart — `stops` is sent as a JSON string):
```
POST /api/orders/custom-delivery
```

```jsonc
{
  "stops": [
    { "lat": 24.71, "lng": 46.67, "name": "ورشة النور", "purchaseList": "مفك + مسامير", "estimatedCost": 50, "notes": "اطلب الكبير", "imageIds": [12, 13] },
    { "lat": 24.74, "lng": 46.69, "name": "سوبر ماركت", "purchaseList": "موز 2 كيلو", "estimatedCost": 30, "imageIds": [14] },
    { "lat": 24.75, "lng": 46.71, "name": "بيت العميل", "label": "الدار" }   // last stop = delivery
  ],
  "itemsDescription": "أدوية عاجلة",
  "driverInstructions": "اتصل قبل الوصول",
  "note": "ملاحظات عامة",
  "tip": 10,
  "paymentMethod": "CASH"
}
```

| Field | Rules |
|---|---|
| `stops` | required — **≥ 2** stops (first = pickup, last = delivery). Each needs `lat`/`lng`; `name`, `label`, `purchaseList`, `notes` are optional strings; `estimatedCost` optional, non-negative. |
| `stops[].imageIds` | optional — see [Station Images](#3-custom-delivery--station-images). |
| `paymentMethod` | required — `CASH` or `WALLET`. |
| `transferNumber`, `transferImage` | required **only when** `paymentMethod = WALLET`. |
| `tip`, `itemsDescription`, `driverInstructions`, `note`, `isGift`, `paidWithWallet` | optional. |

**Payment**
- `CASH` → customer pays the driver on delivery; order stays unpaid until delivered.
- `WALLET` → online / Vodafone-Cash-style manual transfer; requires `transferNumber`
  (Egyptian phone `01[0125]XXXXXXXX`) **and** `transferImage` (receipt). Marks the order paid at
  creation.

> Creation is idempotent within a ~20-second window for the same customer + same pickup/delivery
> coords + total, so an accidental double-submit returns the same order.

**3. Track the order** through the normal `GET /api/orders` / `GET /api/orders/:id`. Custom orders
include the ordered `Stations` (each with its `Images`) and a `customDeliveryProgress` block:
```json
{ "currentStep": 2, "totalSteps": 3, "finished": false }
```

### Driver flow

| Tab | Request |
|---|---|
| **New** (invitations) | `GET /api/delivery/me/pending-assignments?type=CUSTOM_DELIVERY` |
| **In Progress** | `GET /api/orders?type=CUSTOM_DELIVERY&current=true` |
| **History** | `GET /api/orders?type=CUSTOM_DELIVERY&past=true` |
| **Active / current** | `GET /api/delivery/me/current-assignment` |

`current=true` = not yet delivered/cancelled; `past=true` = delivered/cancelled. All driver
order/assignment responses carry `Stations` (with `Images`) + `customDeliveryProgress`.

**Accept the invitation** → moves the order to in-progress and flips station 1 to active:
```
PATCH /api/orders/:id/accept
```

**Advance ("Move to next location")** — completes the active station, advances the next:
```
PATCH /api/orders/custom-delivery/:id/advance
Body (optional): { "lat": 24.74, "lng": 46.69 }
```
Rejected on the final station (use finish instead).

**Finish ("Finish Task")** — valid only once every earlier station is reached:
```
PATCH /api/orders/custom-delivery/:id/finish
Body (optional): { "lat": 24.75, "lng": 46.71 }
```
> **Send `lat`/`lng` on finish** — the delivery transition rejects a finish without coordinates.

### Station state machine

```
WAITING ──> GOING ──> REACHED          (per station, strictly sequential — no skipping)
```
While an order is in progress, **exactly one** station is active (`GOING`); earlier ones are
`REACHED`, later ones `WAITING`.

**Blocked actions (all return `400`, except where noted):**
- Finishing while an earlier station isn't reached — *"Cannot finish before completing all stations"*.
- Advancing the final station — *"Last station must be completed via finish"*.
- Advancing with no active station — *"No active station to complete"*.
- Acting on an order that isn't in progress — *"Order is not in progress"*.
- Acting as anyone but the assigned driver — **`403`** *"Only the assigned driver can update this order"*.

### Notifications
- **Advance** → customer gets *"Station reached — driver completed station N of M"*.
- **Finish** → standard delivered notifications fire.

---

## 3. Custom Delivery — Station Images

### How it works 🛍️ 🚚

A customer can attach **0, 1, or many images per station** (a photo of the exact part to buy, a
prescription, a reference picture). Images are **per-station** and apply **only** to custom-delivery
orders. Because stations don't exist yet while the form is being filled, you **upload first → get back
integer ids → embed those ids per stop on create**. The client only ever sends server-issued ids —
never a file path or URL.

### 1. Upload images

```
POST /api/orders/custom-delivery/images
Auth: any authenticated customer (orders permission) · multipart/form-data · field name: images
```

| Rule | Value |
|---|---|
| Field name | `images` (repeatable file field — send one or more under the same key) |
| Max files / request | **10** |
| Max size / file | **5 MB** |
| Allowed types | `image/*` only (jpeg, png, webp…) — non-images rejected |

**Response `201`:**
```json
{ "message": "images uploaded successfully", "data": { "imageIds": [12, 13] } }
```
Returned ids belong to you and stay unused until an order consumes them. Call the endpoint as many
times as you like (e.g. once per station) and collect the ids.

### 2. Attach on create

Put each station's ids in that stop's `imageIds` on `POST /api/orders/custom-delivery`. At creation,
each stop's ids are validated and attached to the matching station by sequence. Attach is
**all-or-nothing** — any invalid id rejects the **whole** order (nothing partially created); the
uploaded images stay valid and can be retried.

**Limits**
- **≤ 5** image ids per station.
- **≤ 20** image ids per order (across all stations).
- Each id must be **your own** and **unused** (single-use).

**Failure cases (all `400`).** These messages are **hardcoded Arabic** regardless of locale — key off
the HTTP status, not the string:

| Cause | Returned message (ar) — English gloss |
|---|---|
| Id doesn't exist / isn't yours / already used | `بعض الصور غير صالحة أو مستخدمة من قبل` — *Some images are invalid or already used* |
| Same id used more than once | `لا يمكن استخدام نفس الصورة أكثر من مرة` — *Can't use the same image more than once* |
| More than 5 on one station | `لا يمكن إرفاق أكثر من 5 صور لكل محطة` — *Max 5 per station* |
| More than 20 across the order | `لا يمكن إرفاق أكثر من 20 صورة للطلب الواحد` — *Max 20 per order* |

### 3. Read images

Every station returned anywhere (customer detail/list, driver current/pending assignment) carries an
`Images` array in upload order. Empty (`[]`) when the station has no photos or for legacy orders.

```jsonc
{
  "Stations": [
    {
      "id": 1000, "sequence": 1, "name": "ورشة النور", "status": "GOING",
      "Images": [
        { "id": 12, "image": "uploads/orders/images-ab12.jpg" },
        { "id": 13, "image": "uploads/orders/images-cd34.jpg" }
      ]
    },
    { "id": 2000, "sequence": 2, "name": "بيت العميل", "status": "WAITING", "Images": [] }
  ]
}
```

### Client checklist
- **Customer 🛍️:** per-station image picker (multi-select), upload on selection, keep returned ids
  tied to *that* station in local state; on submit send `stops[i].imageIds`. Mirror the limits
  client-side. Treat create as atomic — on `400`, the order wasn't created; retry with the same ids.
- **Driver 🚚:** render each station's `Images` in the per-station working view so the driver sees
  exactly what to buy/pick up.
- **No cleanup needed:** images uploaded but never attached are auto-removed server-side after 24h.
  There is no client cleanup call.

---

## 4. Gift Orders

### How it works

A boolean `isGift` flag marks an order as a gift at placement so the driver handles delivery
accordingly (e.g. no price labels, gift packaging). Default `false`; omitting the field = non-gift.
**Purely additive — no breaking change.**

### Integration

- **Create order** (`POST /api/orders`) and **create custom delivery** (`POST /api/orders/custom-delivery`)
  accept optional `isGift` (`true` / `false`). On multipart, send the string `"true"` / `"false"`.
- **Every order response** (customer, driver, admin) now includes `isGift`.
- Two otherwise-identical orders placed within the dedup window but with different `isGift` values are
  treated as distinct orders.
- Scheduled gift orders preserve the flag through the schedule→realize cycle — no special handling.

### Client checklist
- **Customer 🛍️:** add a "This is a gift" toggle on checkout; show a gift badge on gift orders in
  history.
- **Driver 🚚:** show a gift icon on the order card and a prominent gift notice on the active order
  detail (don't show the receipt/price to the recipient).
- **Admin 🖥️:** optionally show a gift indicator column/badge. No filter exists for `isGift` yet —
  request one if needed.

---

## 5. Orders — City / Zone / Type Filters

### How it works 🖥️

The orders list can filter by **delivery zone** and **delivery city** — both describe *where the order
is delivered to* (the customer's destination), not where the store is. City and zone form a hierarchy:

```
City  ⊃  Zone  ⊃  exact delivery point
```

An order's city is derived **through** its zone, so the two never disagree. Each order's zone is
resolved **once, at creation**, from its delivery coordinates (the customer address for `DELIVERY`,
the final stop for `CUSTOM_DELIVERY`; `PICKUP` has no destination so its zone stays null).

### New query params

```
GET /api/orders?cityId=1
GET /api/orders?zoneId=3
GET /api/orders?cityId=1&zoneId=3
GET /api/orders?type=CUSTOM_DELIVERY
GET /api/orders?cityId=1&deliveryId=42&status=ON_THE_WAY     // composes with existing filters
```
Also applies to `GET /api/orders/archived`.

| Param | Type | Description |
|---|---|---|
| `cityId` | number | Orders whose delivery **zone** belongs to this city. |
| `zoneId` | number | Orders whose delivery point falls in this zone. |
| `type` | `DELIVERY` \| `PICKUP` \| `CUSTOM_DELIVERY` | Previously declared but inert — **now active**. |

All optional; omit them and behavior is unchanged. They compose via `AND` with each other and every
existing filter.

### Behavior notes
- Orders that matched no zone (or were created before this feature) have `zoneId = null` and are
  **excluded** by both the zone and city filters — there's no backfill.
- A zone with no city is never returned by the city filter.

### Zones — `cityId` on create/edit 🖥️

`POST /api/zones` and `PATCH /api/zones/:id` accept an optional `cityId`. Required fields remain
`name` (bilingual) and `coordinates` (polygon, ≥ 3 `{lat,lng}` points); update also accepts `active?`.

**Client action:** add a **city selector** to the zone create/edit form. A zone with no `cityId` is
excluded from the orders city filter — for the filter to work, zones need a city.

---

## 6. Driver Assignment — Bulk Assign, Batch Accept & AFK Break

### 6.1 Bulk assignment 🖥️ (**BREAKING** — route changed)

The single-order manual assignment endpoint was replaced by a bulk one. Order ids now live in the
request body as an array; one and many orders use the same call.

**Before** → **After**
```
PATCH /api/orders/:id/assign  { specialistId }
→
PATCH /api/orders/assign      { specialistId, orderIds: [101, 102, 103] }
```

| Field | Rules |
|---|---|
| `specialistId` | required — the driver id |
| `orderIds` | required — **1 to 20** positive integers |

**Response — best-effort, per-order:**
```json
{ "data": { "succeeded": [101, 103], "failed": [{ "orderId": 102, "reason": "Order type is pickup" }] } }
```

**Behavior to handle in the UI**
- A failure on one order never blocks the others — render `succeeded` / `failed` with reasons.
- Even single-order assignment must now send `orderIds: [id]`.
- If the target driver is on an AFK break, the **whole request is rejected** with
  `400 Driver is on a break until HH:MM`.
- One successful order → normal single push; more than one → a single aggregated "You have N new
  orders" push (the driver isn't spammed).

### 6.2 Batch accept (driver) 🚚

```
GET   /api/delivery/me/pending-assignments      → all non-expired pending invitations + order details
PATCH /api/delivery/me/assignments/accept       → accept ALL pending at once → { succeeded, failed }
```
Existing per-order `GET /me/current-assignment`, `PATCH /orders/:id/accept`, `PATCH /orders/:id/reject`
are untouched. **There is no batch reject** — "ignoring" an order means letting its 90-second window
lapse. Model invitations as **accept / ignore**, not accept / reject.

### 6.3 AFK break (15-minute bench) 🚚

When a driver lets an invitation lapse (no response within 90s), they're treated as away:

- **Idle** at timeout → benched immediately for 15 minutes; goes offline; driver + admins notified.
- **On an active trip** → the break is **deferred** and applied when they finish their last active
  trip. The driver is never benched mid-trip.

**While on break**, the driver can't come back early — check-in, force-available, and being assigned
are all rejected (`You are on a break until HH:MM`). After 15 minutes they auto-resume (back online if
still within shift, with a "break over" push; stays offline if their shift ended during the break).

A timed-out order is automatically re-offered to the next-nearest available driver when assignment mode
is AUTO (the driver who just lapsed is excluded so it doesn't bounce back); in MANUAL mode it's left
for a moderator.

### Client checklist 🚚
- "Pending invitations" list (`GET /me/pending-assignments`) + "Accept all" action with partial-result
  handling.
- Surface AFK-break states: show "on break until HH:MM" and disable check-in / force-available while
  benched.

---

## 7. Driver Management Dashboard 🖥️

Two **new** admin views; all pre-existing delivery endpoints are unchanged.

### 7.1 Drivers listing (cards)

```
GET /api/delivery
GET /api/delivery?page=1&limit=10
GET /api/delivery?search=ahmed         // matches name OR email OR phone (case-insensitive)
```
`limit` defaults to 10 (capped per env, currently 40; `-1` = all). Scoped to drivers, newest first.

```jsonc
{
  "message": "Deliveries fetched successfully",
  "data": [{
    "id": 12, "name": "Ahmed Ali", "email": "...", "phone": "+2012...",
    "avatar": "uploads/a.png",   // null when no image
    "isVerified": true,
    "isAvailable": false,        // "متاح إجباري" — always-available (force-available) toggle
    "isOnShift": true,           // "شغال النهاردة" — live shift status
    "createdAt": "2026-05-01T10:00:00.000Z"
  }],
  "total": 37,
  "pagination": { "page": 1, "limit": 10, "total": 37, "totalPages": 4 }
}
```
> Distinct from the older `GET /api/delivery/all`.

### 7.2 Per-driver day dashboard

```
GET /api/delivery/:id/dashboard
GET /api/delivery/:id/dashboard?date=2026-06-04     // defaults to today
```
Returns `404` if `:id` is not a driver.

```jsonc
{
  "data": {
    "profile": { "id": 12, "name": "...", "email": "...", "phone": "...", "avatar": "...", "isVerified": true, "isAvailable": false, "isOnShift": true },
    "statistics": { "selectedDate": "2026-06-04", "acceptedOrders": 8, "rejectedOrders": 0, "deliveredOrders": 5 },
    "financialSummary": { "totalOrdersAmount": 2857.82, "deliveryFees": 2056.82, "adminCommission": 0 },
    "acceptanceSummary": { "acceptedOrders": 8, "rejectedOrders": 0 },
    "orders": [{
      "id": 70, "customerName": "fahd hake", "customerPhone": "+2001...",
      "storeName": { "ar": "...", "en": "test" },                          // raw bilingual JSON
      "productsSummary": [ { "quantity": 1, "name": { "ar": "...", "en": "x1test" } } ],
      "invoiceTotal": 231.38, "deliveryPrice": 200, "notes": null,
      "status": "DELIVERED", "createdAt": "2026-06-04T14:32:00.000Z"
    }]
  }
}
```

**Notes**
- All financials are read from persisted order values — display as-is, don't recompute.
- `rejectedOrders` = explicit rejects **+ timeouts** (since drivers now mostly time out rather than
  actively reject).
- `totalOrdersAmount` sums **all** the driver's orders that day, not only delivered.
- `storeName` and `productsSummary[].name` come back as raw bilingual JSON.

> **Auth note:** both new endpoints currently follow the same posture as their siblings — **no auth
> guard**. Don't assume they're protected yet.

---

## 8. Fortune Wheel

### How it works 🛍️ 🖥️

A customer-facing promotional wheel. An admin configures a global display interval and weighted reward
items. The **backend is the source of truth** for whether the wheel may show/spin right now (can't be
bypassed by clearing local storage or switching devices) and for what the customer wins. Full loop:
admin configures → customer becomes eligible → spins → wins a reward → redeems it at checkout.

Base prefix: `/api/fortune-wheel`.

### Customer endpoints (any authenticated user)

| Method & Path | Purpose |
|---|---|
| `GET /eligibility` | Should the wheel show now? Returns `shouldShow`, `nextEligibleAt`, `displayIntervalHours`, `items[]`. |
| `POST /mark-shown` | Analytics only — stamps "shown". Does **not** start the cooldown. |
| `POST /spin` | Server-authoritative spin. Returns the won item + (on a win) `reward.id` + `reward.expiresAt`. |
| `GET /my-rewards` | Paginated rewards, filter `status = valid \| used \| expired`. |

**Eligibility response:**
```json
{ "shouldShow": true, "nextEligibleAt": null, "displayIntervalHours": 10,
  "items": [ { "id": 1, "displayName": "...", "rewardType": "DISCOUNT", "rewardValue": 10,
               "weight": 1, "maxDiscount": null, "minOrderAmount": null,
               "maxOrderAmount": null, "rewardExpiryHours": 24 } ] }
```
`shouldShow` is `false` (and `items` empty) when the wheel is disabled, has no active items, or the
per-user countdown hasn't elapsed.

**Spin result:**
- Win → `{ isWin: true, wonItem, reward: { id, expiresAt } }`.
- "Better luck next time" segment → `{ isWin: false, wonItem, reward: null }`.

> **The cooldown is driven by the spin, not the show.** `mark-shown` is analytics only — only a spin
> advances `nextEligibleAt`. If `eligibility.shouldShow` is `false`, don't render the wheel. Double-tap
> spins are guarded server-side (only the first wins the window; the rest get `409 Not eligible yet`).

### Reward types
`DISCOUNT` (percent, capped by `maxDiscount`), `FREE_DELIVERY`, `FIXED_AMOUNT`, `NONE`
("better luck next time"), and `CUSTOM`. **`CUSTOM` is display/admin-fulfilled only and not redeemable
at checkout.**

### Checkout redemption

Pass `fortuneRewardId` on the order calculate/create payload. The order flow validates it (must be
yours, still valid, not expired, order within the reward's min/max amount) and consumes it atomically
with order creation — it can't be double-spent. See pricing behavior in
[Orders — Pricing & Checkout](#1-orders--pricing--checkout) (combined `discountValue`,
free-delivery-keeps-tip, `rewardId` echo).

### Admin endpoints (`fortune-wheel` permission)
- `GET /settings`, `PATCH /settings` (`displayIntervalHours` ≥ 1, `isEnabled?`).
- Reward item CRUD: `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `PATCH /:id/toggle-status`,
  `DELETE /:id`.
- Item rules: `DISCOUNT` needs `rewardValue` 1..100; `FIXED_AMOUNT` needs `rewardValue > 0`;
  `minOrderAmount ≤ maxOrderAmount` when both present.

### Client checklist
- **Customer 🛍️:** gate display on `GET /eligibility` → render the wheel from `items[]` → on spin call
  `POST /spin` and animate to the returned `wonItem` → show win/no-win → surface rewards via
  `GET /my-rewards` → allow redeeming at checkout via `fortuneRewardId`.
- **Admin 🖥️:** settings screen + reward-item CRUD screens.

---

## 9. Campaigns — Notifications & Offers

### Concepts 🖥️ 🛍️

A campaign is one of two types:
- **NOTIFICATION** — sends a push to customers **once, on creation only**. Editing or toggling status
  never re-sends.
- **OFFER** — an in-app popup shown to customers; **never** sends a push.

**Audience is always customers only**, even for `ALL` / `STORE` / `SERVICE`. Only `SELECTED_USERS`
narrows to specific customer ids. `storeId` / `serviceId` are **deep-link/display metadata** (what the
popup opens), not audience filters. Offer throttling is enforced server-side per user.

### Admin endpoints (`campaigns` permission)

#### Create — `POST /api/campaigns` (multipart) 🖥️
```jsonc
{
  "type": "NOTIFICATION",                       // required: "NOTIFICATION" | "OFFER"
  "title": { "ar": "عنوان", "en": "Title" },    // required (bilingual)
  "description": { "ar": "...", "en": "..." },  // REQUIRED for NOTIFICATION (push body); optional for OFFER
  "featureText": { "ar": "...", "en": "..." },  // optional
  "valueText":   { "ar": "...", "en": "..." },  // optional
  "image": "<file>",                            // multipart file; REQUIRED for OFFER popups
  "targetType": "ALL",                          // ALL | CUSTOMER | STORE | SERVICE | SELECTED_USERS
  "targetUserIds": [12, 34],                    // REQUIRED when targetType = SELECTED_USERS
  "storeId": 5,                                 // REQUIRED when targetType = STORE (deep-link target)
  "serviceId": 9,                               // REQUIRED when targetType = SERVICE (deep-link target)
  "startAt": "2026-06-10T00:00:00.000Z",        // optional (OFFER scheduling)
  "endAt":   "2026-06-20T00:00:00.000Z",        // optional; must be strictly AFTER startAt
  "displayIntervalHours": 24                    // optional; OFFER popup frequency cap per user
}
```
Response `201`. NOTIFICATION campaigns carry a dispatch summary (how many customers were reached);
OFFER campaigns have no dispatch payload.

**Conditional validation to mirror client-side:** `type` + `title` always required; `description`
required only for NOTIFICATION; `targetUserIds` required for `SELECTED_USERS`; `storeId` for `STORE`;
`serviceId` for `SERVICE`; `endAt` strictly after `startAt`; `image` required for OFFER.

`displayIntervalHours` for offers: `null` → 24h, `0` → show every fetch, `N` → every N hours.

> **Make "sends immediately, cannot be re-sent" explicit in the create form**, and show the returned
> reached count.

#### Other admin routes
- `GET /api/campaigns` / `GET /api/campaigns/:id` — paginated list / single. Filters: `id`, `title`,
  `type`, `status` (`active | scheduled | expired | inactive` — a **derived** value), `dateFrom`,
  `dateTo`, `page`, `limit`, `orderBy`.
- `PATCH /api/campaigns/:id/status` — `{ "manualStatus": "ACTIVE" | "INACTIVE" }`. Does **not** re-send.
- `PATCH /api/campaigns/:id` — update (multipart, same fields, all optional). Does **not** re-dispatch.
- `DELETE /api/campaigns/:id` — soft delete.

**Campaign object (admin):**
```jsonc
{
  "id": 1, "type": "OFFER",
  "title": {...}, "description": {...}, "featureText": {...}, "valueText": {...},
  "image": "uploads/campaigns/x.png",
  "targetType": "STORE", "targetUserIds": [12, 34],
  "storeId": 5, "serviceId": null,
  "startAt": "...", "endAt": "...", "displayIntervalHours": 24,
  "manualStatus": "ACTIVE",                 // stored on/off flag
  "sentAt": "2026-06-06T12:00:00.000Z",     // NOTIFICATION dispatch timestamp (null until sent)
  "createdAt": "...",
  "Store":   { "id": 5, "name": {...} },
  "Service": { "id": 9, "name": {...} }
}
```
> The list `status` filter is **derived** from `manualStatus` + the schedule window; the object itself
> stores `manualStatus` (`ACTIVE`/`INACTIVE`). Compute the badge client-side the same way, or rely on
> the filter. Show `sentAt` to indicate a notification already went out.

### Customer endpoints (Customer token — non-customers get `403`)

#### Offers popup feed — `GET /api/campaigns/active-offers` 🛍️
Returns the offer campaigns the current customer is eligible to see **right now** (active, within the
schedule window, and due per the per-user frequency cap). The customer projection **omits**
`manualStatus`, `sentAt`, and internal rows, and includes richer deep-link embeds:
```jsonc
{
  "id": 1, "type": "OFFER",
  "title": {...}, "description": {...}, "featureText": {...}, "valueText": {...},
  "image": "...", "targetType": "STORE", "storeId": 5, "serviceId": null,
  "startAt": "...", "endAt": "...", "displayIntervalHours": 24,
  "Store":   { "id": 5, "name": {...}, "logo": "..." },
  "Service": { "id": 9, "name": {...}, "image": "...", "price": 120 }
}
```

#### Mark offer shown — `POST /api/campaigns/:id/viewed` 🛍️
Call **after** displaying the popup to start the cooldown. Without it, the same offer keeps
reappearing.

### Offer popup flow 🛍️
1. On app foreground/home load → `GET /api/campaigns/active-offers`.
2. Render each offer popup (`image`, `title`, `featureText`, `valueText`).
3. On tap → deep-link using `storeId` (open store, use `Store.logo`/`name`) or `serviceId` (open
   service, use `Service.image`/`name`/`price`).
4. After it's shown → `POST /api/campaigns/:id/viewed` to start the cooldown.
5. Trust the feed — the server already applies the frequency cap; don't re-show within the window.

> Operational/system alerts (e.g. delivery-timeout admin alerts) may bypass the user's notification
> opt-out, but all **promotional** notifications (campaigns, coupons, admin broadcasts) respect it.

---

## 10. Banners 🖥️ 🛍️

### How it works

Banners support a **targeting hierarchy** (general → store → category → service → zone, plus a special
driver banner), scheduling windows, ordering, and click tracking. Admins manage banners; customers see
only the active, in-window ones; click tracking is public.

Banner endpoints are under the `banners` tag.

### Banner types & required fields

| Type | Required fields | Notes |
|---|---|---|
| General | `name`, `image` | `targetType` defaults to `GENERAL` |
| Store | `name`, `image`, `storeId` | |
| Category | `name`, `image`, `storeId`, `categoryId` | category must belong to the store's module |
| Service | `name`, `image`, `storeId`, `serviceId` (+`categoryId`) | service must belong to the store (and category if given) |
| Zone | `name`, `image`, `storeId`, `zoneIds[]` | zones must be reachable through the store's branches |
| Special Driver | `name`, `image`, `targetType=SPECIAL_DRIVER` | no store/category/service required |

### Endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/banners` | admin | Create banner (**multipart** — has image upload) |
| `PATCH /api/banners/{id}` | admin | Update banner (multipart; image optional on update) |
| `DELETE /api/banners/{id}` | admin | Delete banner |
| `GET /api/banners` / `GET /api/banners/{id}` | visitor | List / detail |
| `GET /api/banners/statistics` | admin | Click stats `[{ id, name, clickCount }]` (use `?id=` for one) |
| `GET /api/banners/store/{storeId}/zones` | admin | Allowed zones for a store (union via its branches) |
| `POST /api/banners/{id}/click` | public | Track a click (atomic increment) |

### Behavior
- **Admin list** returns **all** banners (incl. inactive/expired/future), ordered by `order asc`, with
  fields: `order`, `startDate`, `endDate`, `clickCount`, `targetType`, `isSpecialDriverBanner`,
  `isCurrentlyActive`, `zoneIds`, `Zones`, `categoryId`, `serviceId`.
- **Customer/visitor list** returns only banners that are `active = true` **and** inside the schedule
  window (`startDate <= now <= endDate`), ordered by `order asc` then a random tiebreaker.
- **`zoneIds`** in multipart: send comma-separated (`4,5`), repeated field, or a JSON array — all
  normalize to an array. Sending `zoneIds` on update **replaces** all links (`[]` clears them).

### Validation failures (all `400` unless noted)
- Service from another store; category not in the store's module; zone not linked to the store's
  branches; store with no branch-zone links; targeting (category/service/zone) without `storeId`;
  `endDate < startDate`.
- Clicking a missing banner → `404`.

---

## 11. Logs (Audit Trail) 🖥️

### How it works

A minimal admin audit trail — only explicit, **successful** actions are recorded (currently login /
logout; the system also writes `AFK_BREAK` rows). Failed logins, generic requests, and data changes
are **not** logged.

```
GET /api/logs?page=1&limit=10
GET /api/logs?page=1&limit=10&action=LOGIN
```
**Auth:** admin token (`logs` permission).

```json
{
  "data": [{
    "id": "uuid",
    "personName": "Ahmed Mohamed",
    "role": "Admin",
    "action": "LOGIN",
    "details": "دخل إلى لوحة التحكم",
    "createdAt": "2026-06-04T10:45:00.000Z"
  }],
  "pagination": { "page": 1, "limit": 10, "total": 40, "totalPages": 4 }
}
```
Sorted newest first. **Client:** a simple paginated audit-trail table. Priority: low.

---

## 12. Breaking Changes — Migration Checklist

> These break existing clients if not updated.

| # | What breaks | Fix |
|---|---|---|
| **B1** 🖥️ | `PATCH /api/orders/:id/assign` with `{ specialistId }` → 404 (route removed) | Call `PATCH /api/orders/assign` with `{ specialistId, orderIds: [...] }` (1–20 ids). Handle `{ succeeded, failed }` and the `400 Driver is on a break` rejection. Even single assignment sends `orderIds: [id]`. |
| **B2** 🖥️ | Unauthenticated `POST /api/admin-notifications` (and GET/DELETE) now return `401/403` | Send an admin access token; ensure the role has the `admin-notifications` permission. |
| **B3** 🚚 | UI assuming an explicit / batch driver reject | Model invitations as **accept / ignore**; there is no batch reject. Use `GET /me/pending-assignments` + `PATCH /me/assignments/accept`. Per-order `PATCH /orders/:id/reject` remains only for legacy. |
| **B4** 🛍️ | UIs treating `discountValue` as coupon-only mis-display once a fortune reward applies | Treat `discountValue` as the **combined** discount; use the submitted coupon + `rewardId` to label. |

**Swagger regeneration:** re-import clients from `http://localhost:3030/api/docs` for the
`Campaigns`, `Fortune Wheel`, `Delivery`, `Orders`, `Zone`, `Banners`, `Admin Notifications`, and
`Logs` tags. New/changed enums to re-check: `CampaignType`, `CampaignTargetType`, `CampaignStatus`,
`OrderType`, `FortuneWheelRewardType`, `StationStatus`, `StationType`.

---

## 13. Summary Table

| Feature | Client action required | Surface | Priority |
|---|---|---|---|
| Order assign route change | Switch to `PATCH /orders/assign` `{ specialistId, orderIds }`; handle partial results + break rejection | 🖥️ | **Critical** |
| Admin notifications auth | Add admin token + `admin-notifications` permission | 🖥️ | **Critical** |
| Driver reject removed | Re-model as accept/ignore; batch accept + pending list; AFK-break states | 🚚 | **High** |
| Order pricing (`discountValue`/`rewardId`) | Treat discount as combined; free-delivery-keeps-tip; send `fortuneRewardId` | 🛍️ | **High** |
| Custom delivery — multi-station | Customer station form + driver New/In-Progress/History tabs + advance/finish | 🛍️ 🚚 | **High** |
| Custom delivery — station images | Upload-first → embed `imageIds` per stop → render station `Images` | 🛍️ 🚚 | **High** |
| Gift orders | "This is a gift" toggle; gift badge/notice on read | 🛍️ 🚚 🖥️ | **Medium** |
| Campaigns — admin | Create/edit/list screens (multipart, conditional validation) | 🖥️ | **High** |
| Campaigns — offers popup | active-offers feed, popup render, deep-link, `viewed` tracking | 🛍️ | **High** |
| Fortune Wheel — customer | Eligibility gating, spin, my-rewards, checkout redemption | 🛍️ | **High** |
| Fortune Wheel — admin | Settings + reward item CRUD | 🖥️ | **Medium** |
| Driver Management dashboard | Cards listing + per-driver day dashboard | 🖥️ | **High** |
| Banners | Targeted banner CRUD (admin) + active-in-window list (customer) + click tracking | 🖥️ 🛍️ | **Medium** |
| Orders city/zone/type filters | City⊃zone filter dropdowns + type filter | 🖥️ | **Medium** |
| Zones `cityId` | City selector on zone create/edit | 🖥️ | **Medium** |
| `pagination` envelope | Adopt `{ page, limit, total, totalPages }` for new lists | 🖥️ | **Medium** |
| Logs viewer | Paginated audit-trail table | 🖥️ | **Low** |

---

*Consolidated from all `/docs` feature documents. The live Swagger spec at `http://localhost:3030/api/docs`
is the authoritative source for exact request/response shapes — verify final payloads with a real token
before implementation.*
