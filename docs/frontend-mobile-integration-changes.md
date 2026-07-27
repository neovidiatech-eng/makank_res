# Frontend & Mobile Integration — Changes Report

> Audience: **Frontend (admin/store dashboard)** and **Mobile (customer + driver apps)** teams.
> Purpose: list every backend change that requires client work so teams can start before the
> integration meeting.
> Base URL: all routes are prefixed with **`/api`** (e.g. `POST /api/campaigns`). Server port `3030`.
> Swagger UI: `http://localhost:3030/api/docs`.
>
> Source of truth for this report: the docs under `/docs`, the live controllers/DTOs, and the
> Prisma enums — not assumptions. Where a behavior is enforced in the service (not the DTO), it is
> called out explicitly.

**Surface legend:** 🛍️ Customer app · 🚚 Driver app · 🖥️ Admin/Store dashboard

---

## Table of Contents

1. [New APIs](#1-new-apis)
2. [Endpoint Changes](#2-endpoint-changes)
3. [New Screens / New Features](#3-new-screens--new-features)
4. [Request Validation Changes](#4-request-validation-changes)
5. [Response Model Changes](#5-response-model-changes)
6. [Campaigns Integration Guide](#6-campaigns-integration-guide)
7. [Pricing Changes](#7-pricing-changes)
8. [Swagger Review](#8-swagger-review)
9. [Breaking Changes](#9-breaking-changes)
10. [Summary Table](#10-summary-table)

---

## 1. New APIs

### Custom Delivery — Special / Multi-Station Orders 🛍️ 🚚

Multi-station errand orders: the customer adds one or more pickup stations (each with name,
shopping list, estimated cost, notes) plus a final delivery point; the driver works the stations
strictly in order (New → In Progress → History tabs, `Move to next location`, `Finish Task`).
New endpoints: `POST /api/orders/custom-delivery(/calculate)`,
`PATCH /api/orders/custom-delivery/:id/advance`, `PATCH /api/orders/custom-delivery/:id/finish`,
and `GET /api/delivery/me/pending-assignments?type=CUSTOM_DELIVERY`.

> **Full spec — endpoints, DTOs, station state machine, pricing, payment, response shape:**
> [`docs/custom-delivery-special-orders.md`](./custom-delivery-special-orders.md).
> Note for the driver app: **send `lat`/`lng` on the `finish` call** — the delivery transition
> rejects a finish without coordinates.
> **Update (after this report):** custom-delivery stations now support **customer-uploaded images
> per station** (upload-first → embed ids on create → stations return an `Images[]`). That delta is
> **not** covered below — see
> [Part 2 addendum](./frontend-mobile-integration-changes-2.md).

### Campaigns (Notifications & Offers) 🖥️ 🛍️

A new admin module to push **NOTIFICATION** campaigns to customers and to manage **OFFER** popups
shown inside the customer app.

#### `POST /api/campaigns` — Create campaign 🖥️

Purpose: create a NOTIFICATION (push to customers) or an OFFER (in-app popup, never pushes).

**Auth:** access token + `campaigns` permission.
**Content-Type:** `multipart/form-data` (the `image` field is a file upload; everything else is a field).

Required / optional fields:

```jsonc
{
  "type": "NOTIFICATION",                       // required: "NOTIFICATION" | "OFFER"
  "title": { "ar": "عنوان", "en": "Title" },    // required (multilingual JSON)
  "description": { "ar": "...", "en": "..." },  // REQUIRED for NOTIFICATION (push body); optional for OFFER
  "featureText": { "ar": "...", "en": "..." },  // optional
  "valueText":   { "ar": "...", "en": "..." },  // optional
  "image": "<file>",                            // multipart file; required for OFFER popups
  "targetType": "ALL",                          // optional: ALL | CUSTOMER | STORE | SERVICE | SELECTED_USERS
  "targetUserIds": [12, 34],                    // REQUIRED when targetType = SELECTED_USERS
  "storeId": 5,                                 // REQUIRED when targetType = STORE (deep-link target)
  "serviceId": 9,                               // REQUIRED when targetType = SERVICE (deep-link target)
  "startAt": "2026-06-10T00:00:00.000Z",        // optional (OFFER scheduling)
  "endAt":   "2026-06-20T00:00:00.000Z",        // optional; must be AFTER startAt
  "displayIntervalHours": 24                    // optional; OFFER popup frequency cap per user
}
```

Response: `201`. For NOTIFICATION campaigns the body carries a dispatch summary (how many customers
were reached); for OFFER campaigns there is no dispatch payload.

**Important behavior the UI must reflect:**
- A NOTIFICATION campaign **dispatches once, on creation only**. Editing or toggling status never
  re-sends. Make this clear in the create form (e.g. "This will be sent immediately").
- An OFFER **never sends a push** — it only appears via the offers popup endpoint.
- Audience is **always customers only**, even for `ALL`/`STORE`/`SERVICE`. `storeId`/`serviceId` are
  **deep-link/display metadata** (what the popup opens), not audience filters.

Priority: **High**

#### `GET /api/campaigns` and `GET /api/campaigns/:id` — List / single 🖥️

**Auth:** `campaigns` permission. Paginated list; single when `:id` given.
Query filters: `id`, `title`, `type`, `status` (`active | scheduled | expired | inactive`),
`dateFrom`, `dateTo`, `page`, `limit`, `orderBy` (`id|createdAt|startAt|endAt`).

> `status` here is a **derived** value (computed from `manualStatus` + `startAt`/`endAt`), not a
> stored column. See [Response Model Changes](#5-response-model-changes).

Priority: **High**

#### `PATCH /api/campaigns/:id/status` — Enable/disable 🖥️

```json
{ "manualStatus": "ACTIVE" }   // "ACTIVE" | "INACTIVE"
```
Toggling status does **not** re-send a notification. Priority: **High**

#### `PATCH /api/campaigns/:id` — Update 🖥️
Multipart (same fields as create, all optional). Does not re-dispatch. Priority: **Medium**

#### `DELETE /api/campaigns/:id` — Delete 🖥️
Soft delete. Priority: **Medium**

#### `GET /api/campaigns/active-offers` — Offers popup feed 🛍️

**Auth:** any access token, **but the service enforces the Customer role — non-customers get `403`.**
Returns the list of offer campaigns the current customer is eligible to see *right now* (active,
within schedule window, and due per the per-user frequency cap). Drives the in-app popup.

Priority: **High**

#### `POST /api/campaigns/:id/viewed` — Mark offer shown 🛍️

**Auth:** Customer access token (same `403` rule). Call **after** displaying the popup to start the
cooldown (`displayIntervalHours`). Without this call the same offer keeps reappearing.

Priority: **High**

---

### Fortune Wheel 🛍️ 🖥️

A customer-facing promotional wheel with admin configuration and checkout redemption. Base prefix
`/api/fortune-wheel`.

**Customer endpoints** (any authenticated user — see note):

| Method & Path | Purpose |
|---|---|
| `GET /api/fortune-wheel/eligibility` | Should the wheel show now? Returns `shouldShow`, `nextEligibleAt`, `displayIntervalHours`, `items[]`. |
| `POST /api/fortune-wheel/mark-shown` | Analytics only — stamps "shown". Does **not** start the cooldown. |
| `POST /api/fortune-wheel/spin` | Server-authoritative spin. Returns won item + (on win) `reward.id` + `reward.expiresAt`. |
| `GET /api/fortune-wheel/my-rewards` | Paginated rewards, filter `status = valid \| used \| expired`. |

> The cooldown is driven by **spin**, not show. `eligibility.shouldShow=false` → don't render the wheel.
> Customer endpoints are not role-scoped in v1 — any authenticated `User` can call them.

**Admin endpoints** (`fortune-wheel` permission): `GET/PATCH /settings`, `POST /`, `GET /` `GET /:id`,
`PATCH /:id`, `PATCH /:id/toggle-status`, `DELETE /:id`.

**Checkout integration:** pass `fortuneRewardId` on the order calculate/create payload to redeem a
won reward (see [Pricing Changes](#7-pricing-changes)).

Priority: **High** (customer app), **Medium** (admin config screens)

---

### Driver Management dashboard 🖥️

Two **new** admin endpoints on the existing `delivery` module. All pre-existing delivery endpoints
are unchanged.

#### `GET /api/delivery` — Drivers listing (cards)

Query: `page` (default 1), `limit` (default 10, `-1` = all), `search` (matches name OR email OR phone).
Returns driver cards + `pagination` metadata. (Distinct from the older `GET /api/delivery/all`.)

```jsonc
{
  "data": [{
    "id": 12, "name": "Ahmed Ali", "email": "...", "phone": "+2012...",
    "avatar": "uploads/a.png",   // null when no image
    "isVerified": true,
    "isAvailable": false,        // forceAvailable ("متاح إجباري")
    "isOnShift": true,           // availableNow ("شغال النهاردة")
    "createdAt": "2026-05-01T10:00:00.000Z"
  }],
  "total": 37,
  "pagination": { "page": 1, "limit": 10, "total": 37, "totalPages": 4 }
}
```

#### `GET /api/delivery/:id/dashboard?date=YYYY-MM-DD`

Per-driver, per-day view: `profile`, `statistics` (accepted/rejected/delivered), `financialSummary`
(`totalOrdersAmount`, `deliveryFees`, `adminCommission`), `acceptanceSummary`, and that day's
`orders[]`. `date` defaults to today. Returns `404` if `:id` is not a driver.

> `storeName` and `productsSummary[].name` come back as raw `{ ar, en }` JSON (resolved to the
> request locale). `rejectedOrders` = `REJECTED` + `TIMEOUT` rows (see Driver Management doc).

**Auth note:** both new endpoints currently have **no `@Auth` guard** (matching the sibling
`GET /delivery/all` and `GET /delivery/:id`). Don't rely on them being protected yet.

Priority: **High** (dashboard)

---

### Driver batch assignments 🚚

| Method & Path | Purpose |
|---|---|
| `GET /api/delivery/me/pending-assignments` | All of the driver's non-expired PENDING invitations + order details. |
| `PATCH /api/delivery/me/assignments/accept` | Accept **all** pending invitations at once → `{ succeeded, failed }`. |

Existing per-order `GET /delivery/me/current-assignment`, `PATCH /orders/:id/accept`,
`PATCH /orders/:id/reject` are untouched. **There is no batch reject** — "ignoring" an order means
letting its 90-second window lapse. Priority: **High**

---

### Logs (audit trail) 🖥️

`GET /api/logs?page=1&limit=10&action=LOGIN` — admin login/logout audit trail. **Auth:** `logs`
permission. Currently logs only `LOGIN` / `LOGOUT` (and `AFK_BREAK` rows written by the system).
Response items: `{ id, personName, role, action, details, createdAt }` + `pagination`.
Priority: **Low**

---

## 2. Endpoint Changes

### Orders — Driver assignment route changed 🖥️ (**BREAKING**)

The single-order manual assignment endpoint was replaced by a bulk one.

**Before**
```
PATCH /api/orders/:id/assign
{ "specialistId": 5 }
```
**After**
```
PATCH /api/orders/assign
{ "specialistId": 5, "orderIds": [101, 102, 103] }   // orderIds: 1..20 positive ints, required
```

Response is best-effort, per-order:
```json
{ "data": { "succeeded": [101, 103], "failed": [{ "orderId": 102, "reason": "Order type is pickup" }] } }
```

**Frontend Action:** change the dashboard call from `PATCH /orders/:id/assign` with `{ specialistId }`
to `PATCH /orders/assign` with `{ specialistId, orderIds }`. Even single-order assignment must now
send `orderIds: [id]`. Render partial success (`succeeded` / `failed` with reasons). Note: if the
target driver is on an AFK break the **whole request is rejected** with `400 Driver is on a break
until HH:MM`. Priority: **High / Critical** (see [Breaking Changes](#9-breaking-changes)).

### Orders — List gains new filters 🖥️

`GET /api/orders` (and `GET /api/orders/archived`) accept new query params. See
[Request Validation Changes](#4-request-validation-changes). The previously-declared-but-inert
`type` filter is **now active**. Existing calls are unaffected when the new params are omitted.
Priority: **Medium**

### Order rejection is effectively deprecated 🚚

Drivers can no longer actively reject in the new flow — they either accept (per-order or batch) or
let the 90s invitation lapse (`TIMEOUT`). The legacy `PATCH /orders/:id/reject` still exists for
backward-compat but should not be the primary path in new driver UI. Reflect "accept / ignore"
semantics, not "accept / reject". Priority: **Medium**

### Admin Notifications now require auth 🖥️ (**BREAKING**)

`POST /api/admin-notifications` (and the `GET`/`GET :id`/`DELETE` siblings) previously had **no
authentication**. They now require an access token + `admin-notifications` permission. Any client
calling these unauthenticated will start getting `401/403`. Priority: **Critical**

---

## 3. New Screens / New Features

### Offers Popup 🛍️
- Build the popup UI (image, title, feature/value text).
- On app foreground/home load: `GET /api/campaigns/active-offers`.
- Render each eligible offer; on tap, deep-link using `storeId`/`serviceId` (open store/service).
- After displaying, call `POST /api/campaigns/:id/viewed` to start the per-user cooldown.
- Respect that the server already applies the frequency cap — don't re-show within the window.
Priority: **High**

### Campaigns admin module 🖥️
Create / Edit / List screens for NOTIFICATION and OFFER campaigns (full guide in §6). Priority: **High**

### Fortune Wheel 🛍️
- Gate display on `GET /eligibility` (`shouldShow`).
- Render the wheel from `items[]`; on spin call `POST /spin` and animate to the returned `wonItem`.
- Show win/no-win; surface won rewards via `GET /my-rewards`.
- Allow redeeming a reward at checkout by sending `fortuneRewardId`.
Priority: **High**

### Driver Management dashboard 🖥️
- Drivers grid (cards) with search + pagination (`GET /api/delivery`).
- Driver detail page with day picker → `GET /api/delivery/:id/dashboard?date=`.
Priority: **High**

### Driver batch accept 🚚
- "Pending invitations" list (`GET /me/pending-assignments`).
- "Accept all" action (`PATCH /me/assignments/accept`) with partial-result handling.
- AFK-break awareness: a driver benched 15 min after letting orders lapse — surface "on break until
  HH:MM" states (check-in, force-available, and assignment are all rejected while on break).
Priority: **High**

### Logs viewer 🖥️
Simple paginated audit-trail table (`GET /api/logs`). Priority: **Low**

---

## 4. Request Validation Changes

### Zones — `cityId` now accepted 🖥️
`POST /api/zones` and `PATCH /api/zones/:id` accept an optional `cityId`. Required fields are still
`name` (multilingual JSON) and `coordinates` (polygon, ≥ 3 `{lat,lng}` points). Update adds `active?`.

**Frontend Action:** add a **city selector** to the zone create/edit form. Note: a zone with no
`cityId` is excluded from the orders **city filter**, so for that filter to work zones need a city.
Priority: **Medium**

### Orders list — new query params 🖥️
| Param | Type | Notes |
|---|---|---|
| `cityId` | number | Orders whose delivery **zone** belongs to this city. |
| `zoneId` | number | Orders whose delivery point falls in this zone. |
| `type` | `DELIVERY \| PICKUP \| CUSTOM_DELIVERY` | Previously declared but inert — now active. |

**Frontend Action:** add city/zone filter dropdowns (city ⊃ zone hierarchy) and wire the order-type
filter. Orders created before zone resolution have `zoneId = null` and won't match either filter.
Priority: **Medium**

### Order assign — `orderIds` validation 🖥️
`orderIds` is required, **1 to 20** positive integers; `specialistId` required. See §2/§9.
Priority: **High**

### Campaign create — conditional requirements 🖥️
- `type`, `title` always required.
- `description` required **only** when `type = NOTIFICATION`.
- `targetUserIds` required when `targetType = SELECTED_USERS`.
- `storeId` required when `targetType = STORE`; `serviceId` required when `targetType = SERVICE`.
- `endAt` must be strictly after `startAt`.
- `image` required for OFFER popups (enforced server-side).

**Frontend Action:** implement conditional form validation mirroring the above so users get
client-side errors before submit. Priority: **High**

---

## 5. Response Model Changes

Update typings/interfaces/models for the following.

### Campaign object (admin list/detail) 🖥️
```jsonc
{
  "id": 1,
  "type": "OFFER",                          // "NOTIFICATION" | "OFFER"
  "title": { "ar": "...", "en": "..." },
  "description": { "ar": "...", "en": "..." },
  "featureText": { "ar": "...", "en": "..." },
  "valueText": { "ar": "...", "en": "..." },
  "image": "uploads/campaigns/x.png",
  "targetType": "STORE",                    // ALL|CUSTOMER|STORE|SERVICE|SELECTED_USERS
  "targetUserIds": [12, 34],
  "storeId": 5, "serviceId": null,
  "startAt": "2026-06-10T00:00:00.000Z",
  "endAt": "2026-06-20T00:00:00.000Z",
  "displayIntervalHours": 24,
  "manualStatus": "ACTIVE",                 // stored on/off flag
  "sentAt": "2026-06-06T12:00:00.000Z",     // NOTIFICATION dispatch timestamp (null until sent)
  "createdAt": "...",
  "Store":   { "id": 5, "name": { "ar": "...", "en": "..." } },
  "Service": { "id": 9, "name": { "ar": "...", "en": "..." } }
}
```
> The list endpoint's `status` **query filter** uses a *derived* status (`active|scheduled|expired|
> inactive`); the object itself stores `manualStatus` (`ACTIVE|INACTIVE`) + the schedule window.
> Compute the badge client-side the same way, or rely on the filter.

### Active-offer object (customer popup) 🛍️
Customer projection **omits** `manualStatus`, `sentAt`, and internal view rows. Includes
deep-link context with richer embeds:
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

### Driver card / driver dashboard 🖥️
New shapes — see §1. Add models for the card (`isAvailable`/`isOnShift` booleans, `avatar`) and the
dashboard (`profile`, `statistics`, `financialSummary`, `acceptanceSummary`, `orders[]`).

### Order calculate response — pricing fields 🛍️
See [Pricing Changes](#7-pricing-changes) for the full field list (`commission`, `rewardId`,
combined `discountValue`, `shipping`, etc.). Priority: **High**

### Generic `pagination` envelope 🖥️
New endpoints return a canonical `pagination` object `{ page, limit, total, totalPages }` alongside
the legacy top-level `total`. Prefer `pagination` for new UI. Priority: **Medium**

---

## 6. Campaigns Integration Guide

A self-contained guide for the team building the Campaigns feature.

### Concepts
- **Two types:** `NOTIFICATION` (sends a push to customers, once, at creation) and `OFFER` (in-app
  popup, **never** pushes).
- **Audience is always customers.** `targetType` `ALL`/`CUSTOMER`/`STORE`/`SERVICE` all reach every
  eligible customer; only `SELECTED_USERS` narrows to specific customer IDs. `storeId`/`serviceId`
  are **deep-link targets**, not filters.
- Eligibility/throttling for OFFERs is **server-side** (per-user, via `displayIntervalHours`).

### Notification Campaigns (admin dashboard 🖥️)

**Create screen** — `POST /api/campaigns` (multipart):
- `type = NOTIFICATION`, `title` (ar/en), `description` (ar/en, **required**), optional
  `featureText`/`valueText`, `image`.
- `targetType` selector; if `SELECTED_USERS` → customer multi-select → `targetUserIds`.
- Warn: "Sends immediately on save; cannot be re-sent." Show the returned dispatch/reached count.

**Edit screen** — `PATCH /api/campaigns/:id`. Does **not** re-send. `PATCH /:id/status` for on/off.

**Listing screen** — `GET /api/campaigns` with filters `type`, `status`
(`active|scheduled|expired|inactive`), `title`, date range, pagination. Show `sentAt` to indicate a
notification already went out.

### Offer Campaigns

**Admin side 🖥️** — same create/edit/list endpoints with `type = OFFER`:
- `image` **required** (popup art). `startAt`/`endAt` schedule the popup; `displayIntervalHours`
  caps how often a given customer sees it (`null`→24h, `0`→every fetch, `N`→every N hours).
- `targetType = STORE`/`SERVICE` requires `storeId`/`serviceId` (the deep-link target).

**Customer app 🛍️** — popup rendering flow:
1. `GET /api/campaigns/active-offers` (Customer token; non-customers `403`).
2. For each returned offer, render a popup: `image`, `title`, `featureText`, `valueText`.
3. On tap → navigate using `storeId` (open store, use `Store.logo`/`name`) or `serviceId` (open
   service, use `Service.image`/`name`/`price`).
4. After it's shown → `POST /api/campaigns/:id/viewed` (viewed tracking → starts cooldown).
5. The server omits already-cooled-down offers from the feed; trust the feed.

**Required APIs (customer):** `GET /campaigns/active-offers`, `POST /campaigns/:id/viewed`.
Priority: **High**

---

## 7. Pricing Changes

The order pricing pipeline now integrates **Fortune Wheel rewards** alongside coupons. Sequence is
Subtotal → Tax → Delivery → Discount(coupon + reward).

### Order calculate / create response (current shape)
`POST /api/orders/calculate/order` (and create) return:
```jsonc
{
  "price": 200,               // subtotal (items incl. commission)
  "totalPrice": 230,          // final total = discountedSubtotal + tax + shipping
  "priceAfterDiscount": 180,  // subtotal after coupon AND reward discount
  "priceAfterTax": 214,       // subtotal + tax
  "discountValue": 20,        // COMBINED coupon + fortune-reward discount
  "commission": 15,           // admin commission portion
  "tax": 14,
  "shipping": 30,             // delivery fee (incl. tip); 0 / tip-only when free-delivery reward applies
  "couponId": 3,
  "rewardId": 7,              // fortune reward consumed (present only when a reward was applied)
  "items": [ /* validated items */ ]
}
```

### What frontend/mobile should expect now
- **`discountValue` is combined** (coupon + reward). If your UI shows separate coupon vs. reward
  lines, you cannot derive them from `discountValue` alone — show the coupon you submitted and treat
  the rest as reward, or display a single "Discount" line.
- **Free-delivery reward** zeroes the delivery fee but **preserves the tip** — `shipping` becomes the
  tip amount (not 0) when a tip was added. Display delivery as free while still charging the tip.
- **`rewardId`** echoes the consumed reward; show "reward applied".
- Redeem by sending **`fortuneRewardId`** on `CalculateOrderDTO` / `CreateOrderDTO`. Pickup orders
  can't use free-delivery rewards (`deliveryFeeExclTip = 0`).
- Driver dashboard financials read persisted `Order.adminCommission`, `Order.shipping`,
  `Order.totalPriceAfterDiscount` — display these as-is; do **not** recompute client-side.

### Completed
- Fortune-reward discount integrated into calculate/create (combined `discountValue`, new `rewardId`).
- Free-delivery handling preserves tip.
- Commission computed via unified store/global helper and surfaced as `commission`.
- Driver dashboard exposes per-day `financialSummary` from persisted order fields.

### Pending / watch-outs
- `discountValue` is not itemized into coupon vs. reward in the response — if product wants a
  per-source breakdown, that's a future backend change; don't assume it exists.
- The `tax`→`serviceFee` rename discussed in the audit is **not** applied — the field is still
  `tax`. Do not rename client-side yet.
- `CUSTOM` fortune rewards are not redeemable at checkout (display/admin-fulfilled only).

---

## 8. Swagger Review

Re-import / regenerate API clients from `http://localhost:3030/api/docs` (or the committed
`swagger-spec.json`). The following tags/paths are new or changed and should be regenerated:

**New paths**
- `POST/GET/PATCH/DELETE /api/campaigns`, `PATCH /api/campaigns/:id/status`
- `GET /api/campaigns/active-offers`, `POST /api/campaigns/:id/viewed`
- `GET /api/fortune-wheel/*` (eligibility, mark-shown, spin, my-rewards, settings, item CRUD)
- `GET /api/delivery` (cards), `GET /api/delivery/:id/dashboard`
- `GET /api/delivery/me/pending-assignments`, `PATCH /api/delivery/me/assignments/accept`
- `GET /api/logs`

**Changed paths / models**
- `PATCH /api/orders/assign` **replaces** `PATCH /api/orders/:id/assign` (body now `{ specialistId, orderIds[] }`).
- `GET /api/orders` + `/api/orders/archived`: new `cityId`, `zoneId`, active `type` query params.
- `POST /api/admin-notifications` (+ siblings): now `@Auth`-guarded (security scheme added).
- `POST /api/zones`, `PATCH /api/zones/:id`: `cityId` (+ `active` on update).
- Order calculate/create response: added `commission`, `rewardId`; `discountValue` now combined.
- `CalculateOrderDTO`/`CreateOrderDTO`: added `fortuneRewardId`.

**Action:** regenerate typed models/SDKs for the `Campaigns`, `Fortune Wheel`, `Delivery`, `Orders`,
`Zone`, `Admin Notifications`, and `Logs` tags. Re-check enums: `CampaignType`,
`CampaignTargetType`, `CampaignStatus`, `OrderType`.

---

## 9. Breaking Changes

> Priority: **Critical** — these break existing clients if not updated.

### B1. Order assignment route + payload changed 🖥️
- **What breaks:** any dashboard call to `PATCH /api/orders/:id/assign` with `{ specialistId }`
  returns 404 (route removed).
- **Why:** refactored into a single bulk endpoint.
- **Fix:** call `PATCH /api/orders/assign` with `{ specialistId, orderIds: [...] }` (1–20 ids).
  Handle `{ succeeded, failed }` partial results and the `400 Driver is on a break` rejection.

### B2. Admin notifications now require auth 🖥️
- **What breaks:** unauthenticated `POST /api/admin-notifications` (and GET/DELETE) now `401/403`.
- **Why:** the endpoint was previously unguarded (security hole); now requires
  `admin-notifications` permission.
- **Fix:** send an admin access token; ensure the role has the `admin-notifications` permission.

### B3. Driver "reject" semantics removed in the new flow 🚚
- **What breaks:** UI that assumes an explicit reject action / a batch reject. There is **no batch
  reject**; ignoring = letting the 90s window lapse.
- **Why:** product rule — accept or time out.
- **Fix:** model invitations as "accept / ignore"; use `GET /me/pending-assignments` +
  `PATCH /me/assignments/accept`. Per-order `PATCH /orders/:id/reject` remains only for legacy.

### B4. Order calculate response — `discountValue` meaning changed 🛍️
- **What breaks:** UIs that treated `discountValue` as the coupon-only amount will mis-display the
  coupon line once a fortune reward is applied.
- **Why:** `discountValue` is now coupon + reward combined; `rewardId` added.
- **Fix:** treat `discountValue` as total discount; use submitted coupon + `rewardId` to label.

---

## 10. Summary Table

| Feature | Frontend/Mobile Action Required | Surface | Priority |
|---|---|---|---|
| Order assign route change | Switch to `PATCH /orders/assign` with `{ specialistId, orderIds }`; handle partial results & break rejection | 🖥️ | **Critical** |
| Admin notifications auth | Add admin token + `admin-notifications` permission to existing calls | 🖥️ | **Critical** |
| Driver reject removed | Re-model as accept/ignore; add batch accept + pending list; AFK-break states | 🚚 | **High** |
| Order pricing (`discountValue`/`rewardId`) | Treat discount as combined; support free-delivery-keeps-tip; send `fortuneRewardId` | 🛍️ | **High** |
| Campaigns — admin | Build create/edit/list screens (multipart, conditional validation) | 🖥️ | **High** |
| Campaigns — offers popup | active-offers feed, popup render, deep-link, `viewed` tracking | 🛍️ | **High** |
| Fortune Wheel — customer | Eligibility gating, spin, my-rewards, checkout redemption | 🛍️ | **High** |
| Driver Management dashboard | Cards listing + per-driver day dashboard | 🖥️ | **High** |
| Driver batch accept | Pending-assignments list + accept-all | 🚚 | **High** |
| Orders city/zone/type filters | Add city⊃zone filter dropdowns + type filter | 🖥️ | **Medium** |
| Zones `cityId` | Add city selector to zone create/edit form | 🖥️ | **Medium** |
| Campaign/offer response models | Update typings (multilingual fields, derived status, embeds) | 🖥️ 🛍️ | **Medium** |
| `pagination` envelope | Adopt canonical `{ page, limit, total, totalPages }` for new lists | 🖥️ | **Medium** |
| Fortune Wheel — admin config | Settings + reward item CRUD screens | 🖥️ | **Medium** |
| Logs viewer | Paginated audit-trail table | 🖥️ | **Low** |

---

*Generated from `/docs`, live controllers/DTOs, and Prisma enums. Verify final payloads against
Swagger (`/api/docs`) with a real token before implementation.*
