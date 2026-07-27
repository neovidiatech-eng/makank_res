# Makanak API — Engineering Handoff

> **Everything built and fixed across this entire engagement, ready for frontend.**
> Every endpoint touched or added, with request/response shapes and the gotchas found while testing each one end-to-end against the **real API** (not just unit tests, not just reading the code). Nothing here is theoretical — every example below was actually run against a live server, and test data was cleaned up afterward. Sections are grouped by feature area; within each area, newer work supersedes older notes (called out explicitly wherever behavior changed again).

---

## Table of Contents

1. [Required Headers — Not Optional](#1-required-headers--not-optional)
2. [Standalone Swagger Page](#2-standalone-swagger-page)
3. [Store Approval Gate](#3-store-approval-gate)
4. [Store Templates — Remove Template](#4-store-templates--remove-template-from-store)
5. [Employees — Custom Roles](#5-employees--custom-roles)
6. [Order Lifecycle — Full Flow (Updated Twice)](#6-order-lifecycle--full-flow-updated-twice)
7. [Delivery Geofence Radius](#7-delivery-geofence-radius)
8. [Geofence "Out of Range" Bug — Diagnostics Added](#8-geofence-out-of-range-bug--diagnostics-added)
9. [Scheduled Orders](#9-scheduled-orders)
10. [Store Ordering (`storeOrder`)](#10-store-ordering-storeorder)
11. [Reorder](#11-reorder)
12. [Store Schedule (Open/Close Hours)](#12-store-schedule-openclose-hours)
13. [Category Search (Templates vs Manual)](#13-category-search-templates-vs-manual)
14. [Pickup Toggle — New](#14-pickup-toggle--new)
15. [Bank Transfer Payment — New](#15-bank-transfer-payment--new)
16. [Wallet-Transfer Payment Verification](#16-wallet-transfer-payment-verification)
17. [Custom Delivery — Three Kinds (Purchase / Restaurant / Online)](#17-custom-delivery--three-kinds-purchase--restaurant--online)
18. [Custom Delivery — Zone-Assisted Stops](#18-custom-delivery--zone-assisted-stops)
19. [Online Delivery — Multi-Recipient Batch (Redesigned)](#19-online-delivery--multi-recipient-batch-redesigned)
20. [Zone-Based Delivery Pricing — App-Wide](#20-zone-based-delivery-pricing--app-wide)
21. [Store-Specific Zone Pricing — Per-Store Override](#21-store-specific-zone-pricing--per-store-override)
22. [Customer-Selected Zone — Regular Orders](#22-customer-selected-zone--regular-orders)
23. [Google Sign-In — Customer Auth](#23-google-sign-in--customer-auth)
24. [Admin Notifications — Image + Driver Deep Link](#24-admin-notifications--image--driver-deep-link)
25. [Financial System Redesign — Driver Wallet](#25-financial-system-redesign--driver-wallet)
26. [Financial System Redesign — Store Wallet](#26-financial-system-redesign--store-wallet)
27. [Financial System Redesign — Withdrawals (No More Bank Accounts)](#27-financial-system-redesign--withdrawals-no-more-bank-accounts)
28. [Financing Double-Crediting Bug — Fixed](#28-financing-double-crediting-bug--fixed)
29. [Dashboard Reset Period](#29-dashboard-reset-period)
30. [All New/Changed Settings — Full Reference](#30-all-newchanged-settings--full-reference)
31. [Auth — Refresh Token Lifetime](#31-auth--refresh-token-lifetime)
32. [Misc Fixes](#32-misc-fixes)
33. [Prisma Schema — What Changed](#33-prisma-schema--what-changed)
34. [Summary Table](#34-summary-table)

---

## 1. Required Headers — Not Optional

Every endpoint, success **or** error, returns `400 {"message":"..."}` with no useful info if either header is missing. **Send both, always:**

| Header | Values | Notes |
|--------|--------|-------|
| `locale` | `ar` / `en` / `admin` | Response message language (`admin` = raw, un-localized) |
| `islocalized` | `true` / `false` | Any other value (including missing) throws `400` |

The login endpoints (`POST /authentication/login/:roleKey`) additionally require a `locale` field **inside the JSON body itself** (not just the header) — `{"email":"...","password":"...","locale":"en"}`. Omitting it returns `400 "locale should not be empty"`.

---

## 2. Standalone Swagger Page

A dedicated, interactive Swagger UI containing **only new/changed endpoints from this whole engagement** (not the full ~180-route API) is live at:

```
/api/docs/new-endpoints
```

"Try it out" works directly against the running server. The full API docs remain at `/api/docs` as always.

A portable JSON export is also written to the repo root as **`swagger-spec.json`** on every server boot — importable into Postman/Insomnia.

---

## 3. Store Approval Gate

A restaurant that **registers itself** via `POST /stores` now starts in a **pending state** and cannot build its catalog until an admin approves it. Admin-created stores are unaffected (approved immediately).

### `POST /stores`
**Auth:** Visitor (self-registration)

Unchanged request/response shape. The created store now has `isStoreAccepted: false` until admin review, unless the caller is an Admin (`isStoreAccepted: true` automatically).

### `PATCH /stores/:id/approval`
**Auth:** Admin

```json
{ "approved": true, "reason": "string (optional, included in rejection notification)" }
```

| Value | Result |
|---|---|
| `approved: true` | `isStoreAccepted=true`, `isVerified=true` + push notification |
| `approved: false` | `isStoreAccepted=false` + push notification with reason |

### `GET /stores?isStoreAccepted=false`
**Auth:** Admin — builds a "pending review" queue.

### ⚠️ Blocked Until Approved

A pending store's owner gets `403 "Your store is still pending admin review"` from `POST /categories`, `POST /services`, `POST /bundles`. Everything else (profile, branches, employees) works normally while pending.

### ⚠️ Owner Can't Self-Approve

`isStoreAccepted`, `isBlocked`, `isVerified` are **stripped** from `PATCH /stores/:id` when the caller is the store owner — silently ignored, not an error.

---

## 4. Store Templates — Remove Template from Store

### `DELETE /stores/:id/apply-template/:templateId`
**Auth:** Admin

Undoes `POST /stores/:id/apply-template` for a **single store only** — soft-deletes the categories this template cloned into this store, clears the applied-template record. The template itself and every other store using it are untouched; the same or a different template can be applied again afterward.

**Response:** `{ "message": "Template removed from store successfully" }`
**Error:** `404 "Template is not applied to this store"`

> Pair with `GET /stores/:id/applied-templates` to list what's currently applied before offering removal in the UI.

---

## 5. Employees — Custom Roles

Was completely non-functional (module not registered, permission missing from catalogue, create call commented out, ownership check commented out) — all fixed.

### `POST /employees`
**Auth:** Store

```json
{
  "name": "string",
  "email": "string",
  "phone": "string",    // must be +20XXXXXXXXXX
  "password": "string",
  "roleId": "number"    // NOT roleKey
}
```

### ⚠️ `roleKey` → `roleId`

The body field is **`roleId`** (numeric id from `POST /roles`), not `roleKey`. Every custom role a store creates shares the same internal `roleKey` (`"Store"`), so `roleId` is required to target a specific one when a store has multiple custom roles.

**Workflow:** `POST /roles` first (note its `id`) → then `POST /employees` with that `roleId`.

### `GET /employees` / `GET /employees/:id` / `PATCH /employees/:id` / `DELETE /employees/:id`
**Auth:** Store — update/delete enforce the employee belongs to the caller's own store (`403` cross-store).

### 📌 Known Scope Limit

`GET /orders` is visitor-mode (optional auth) — any logged-in store employee can read the order list without an explicit `orders` permission (data still scoped to their own store only, read-only). Flag if a stricter read gate is needed.

---

## 6. Order Lifecycle — Full Flow (Updated Twice)

This is the most important section for the customer app / driver app / store dashboard. The flow described here is the **current, correct** behavior — an earlier version of this doc described an intermediate (still-buggy) state; this supersedes it.

### Step 1 — Customer places an order

`POST /orders` → order starts at `PENDING`.

**Only the store is notified at this point.** Driver assignment does **not** start yet — this was a real bug (store and driver were notified simultaneously) that's now fixed.

### Step 2 — Store accepts or rejects

- `PATCH /orders/:id/PREPARING` → accept
- `PATCH /orders/:id/REJECTED` → reject (customer notified immediately)

**This is the moment driver assignment logic kicks in** (see below) — never before.

### Step 3 — Driver assignment (depends on `deliveryAssignmentMode` setting)

| Mode | Behavior |
|---|---|
| `AUTO` (default) | Assignment is **scheduled**, not immediate — the system waits `driverAssignmentDelaySeconds` (default 480s / 8 minutes) after the store accepts, then searches for the nearest available driver and sends them an offer. A background job (runs every minute) performs the actual search once the wait elapses. |
| `MANUAL` | Nothing automatic happens. An admin manually assigns via `PATCH /orders/assign`. |

**Why the delay exists:** gives the store a head start to actually prepare the order before a driver is dispatched and starts waiting around, and avoids offering the order to a driver before the store has even had a chance to reject it.

### `PATCH /orders/assign`
**Auth:** Admin — manually assigns one or more orders to a specific driver (`MANUAL` mode, or to override `AUTO`).

```json
{ "specialistId": 12, "orderIds": [101, 102] }
```

### Step 4 — Driver accepts or rejects the offer

- `PATCH /orders/:id/accept` — **Auth: Driver** — binds `deliveryId` to the order. Returns `400 "This order is no longer available"` if the store already rejected/cancelled it, or it's already delivered.
- `PATCH /orders/:id/reject` — **Auth: Driver** — declines. Applies (or defers) an AFK break (gated by `deliveryAfkBreakEnabled`, off by default) and immediately re-runs assignment excluding this driver: `AUTO` → next-nearest driver gets a fresh offer automatically; `MANUAL` → left unassigned for the admin.

If the offer times out (`deliveryAcceptanceTimer` seconds, default 90) without a response, the same re-assignment logic runs automatically via a background job.

### Step 5 — Store marks "ready for pickup"

`PATCH /orders/:id/READY_PICKUP` — notifies the customer and the assigned driver (if any). **Fallback safety net:** if somehow no driver is assigned yet at this point, and the AUTO-mode scheduled delay isn't still pending, the system searches immediately here too (so an order never gets permanently stuck with no driver).

### Step 6 — Driver picks up ("on the way")

`PATCH /orders/:id/ON_THE_WAY` — **Auth: Driver** — **Body:** `{ "lat": number, "lng": number }`. Driver must be within `pickupGeofenceRadiusMeters` (default 1500m) of the branch, checked against the coordinates sent in the body (not the driver's last-known GPS ping). Rejected with the exact live distance in the error message if too far.

### Step 7 — Driver delivers

`PATCH /orders/:id/DELIVERED` — **Auth: Driver** — **Body:** `{ "lat": number, "lng": number }`. Same geofence check against `deliveryGeofenceRadiusMeters` (default 1500m), this time against the customer's saved address coordinates.

### Unassign

`PATCH /orders/:id/unassign` — **Auth: Store/Admin** — removes the current driver and resets status to `READY_PICKUP` so a new driver can be assigned.

> **✅ Verified live (this round):** Created a real order, confirmed only the store got a `NEW_ORDER` notification and zero assignment rows existed. Accepted (`PREPARING`) — confirmed `assignmentReadyAt` got scheduled and still no assignment. Temporarily shortened the delay to 20s, waited for the background job — confirmed a `PENDING` assignment appeared automatically at the right time. Separately verified `MANUAL` mode schedules nothing at all. Separately verified the `READY_PICKUP` fallback does **not** fire early and defeat a still-pending AUTO delay.

---

## 7. Delivery Geofence Radius

Both pickup and delivery radii were hardcoded at 1500m. Now **two independent admin settings**, both under `domain: DELIVERY`:

| Setting Key | Type | Controls |
|---|---|---|
| `pickupGeofenceRadiusMeters` | `NUMBER` | Max distance (m) between driver and branch for `ON_THE_WAY` |
| `deliveryGeofenceRadiusMeters` | `NUMBER` | Max distance (m) between driver and customer address for `DELIVERED` |

Read/write via `GET /settings?domain=DELIVERY` / `PATCH /settings` (admin only). Both seeded to `1500` (unchanged behavior until an admin retunes them).

---

## 8. Geofence "Out of Range" Bug — Diagnostics Added

**Reported symptom:** a driver standing at the exact same location as the customer pressed "delivered" and the app said they were ~45km away, despite the configured radius being much smaller.

**What we found after a full trace** (haversine formula, DTO field mapping, radius settings, coordinate source) **twice, in two separate audit passes**: the backend logic itself is clean — no lat/lng swap, no unit bug, correct formula, correct settings. We could not reproduce the bug from the code.

**What we did instead of guessing at a fix:** added unconditional diagnostic logging at both geofence checkpoints (`ON_THE_WAY` and `DELIVERED`) that fires on every check, pass or fail:

```
[geofence-debug] ON_THE_WAY order=123 driver=(30.05,31.24) branch=(30.05,31.24) distance=0m threshold=1500m
[geofence-debug] DELIVERED order=123 driver=(30.05,31.24) address=(30.048,31.238) addressId=1 distance=294m threshold=1500m
```

**When this happens again**, grep the server log for `geofence-debug` around that order's timestamp — the log line has everything needed to tell apart a real backend bug from stale GPS on the driver's phone, or an address whose saved coordinates don't match where the customer actually is.

---

## 9. Scheduled Orders

Orders with `category: "SCHEDULED"` go into `GET /orders/archived` and are converted into real, live orders automatically by a background job that runs every minute — no manual action needed.

**No endpoint change.** At `scheduledAt`, the order disappears from `GET /orders/archived`, appears in `GET /orders` at `PENDING` (triggering the normal store-notify → accept → assign flow above), and retains `category: "SCHEDULED"` in history.

---

## 10. Store Ordering (`storeOrder`)

`GET /stores?orderBy[storeOrder]=asc` — lets a manually-set `storeOrder` number control display order within a category/search, instead of the default sort. Confirmed already working; the only gap fixed was that `storeOrder` itself wasn't being returned in the store list/detail response payload (now included).

---

## 11. Reorder

### `POST /orders/:id/reorder`
**Auth:** Customer (must own the original order)

```json
{
  "paymentMethod": "CASH",
  "paidWithWallet": false,
  "addressId": 5,
  "note": "string (optional)"
}
```

Re-submits a past order's items/bundles as a **brand-new order, re-priced from scratch** — not a copy of the old invoice. Menu prices, addon prices, and bundle rules are re-validated against their current state, so if a price changed since the original order, the reorder reflects the new price. Items belonging to a bundle whose underlying `Bundle` offer was since deleted are silently dropped rather than failing the whole reorder.

Only regular store orders (`DELIVERY`/`PICKUP`) can be reordered — `400` for `CUSTOM_DELIVERY` orders (no "items" concept there) and for orders with no `branchId`.

> **✅ Verified live:** Reordered an order whose service price had since been discounted from 75→60 — reorder correctly charged 60 (the current price), not the original 60 either — then bumped the price to 90 and reordered again, correctly charged 90. Confirms it truly re-prices, never copies.

---

## 12. Store Schedule (Open/Close Hours)

**Investigated a "the schedule isn't working, I have to open/close the store manually" report.** Live-verified the cron (`StoreScheduleCronService`, runs every minute) computes open/closed correctly from a branch's weekly `StoreSchedule` rows **when `Branch.status === NORMAL`**.

**Root cause of the reported symptom:** `Branch.status` has a manual override (`OPEN`/`CLOSED`/`BUSY`) that takes precedence over the schedule and is only auto-reset back to `NORMAL` once a day (4am Cairo time). If a branch's status gets stuck at `OPEN` or `CLOSED` (e.g. from a manual force-open/close action, or leftover test data), the schedule engine is correctly *ignoring* it as designed — not broken.

**No code change made** — this is a design question worth a decision: is "stuck until next 4am" the intended behavior for a manual override, or should it become a time-bound temporary override instead? Flag if you want this changed.

---

## 13. Category Search (Templates vs Manual)

Confirmed already working, no code change needed. A category a store adds manually on top of an already-applied template (`Category.templateCategoryId = null`) shows up in `/search?model=Category&fields=name&value=...` exactly the same as a template-provided category — the search endpoint has no special-casing that would exclude it. Category images work identically for both manually-added and template-provided categories.

---

## 14. Pickup Toggle — New

Admin can now globally enable/disable whether customers may choose `OrderType.PICKUP` at all.

### New Setting

| Setting Key | Type | Domain | Default |
|---|---|---|---|
| `pickupEnabled` | `BOOLEAN` | `ORDER` | `true` |

When `false`, both `POST /orders/calculate` and `POST /orders` reject a `"type": "PICKUP"` request with `400 "خدمة الاستلام من الفرع مغلقة حالياً"`.

> **✅ Verified live:** Disabled the setting, confirmed a PICKUP order was rejected; re-enabled, confirmed it succeeded.

---

## 15. Bank Transfer Payment — New

Customers paying via `paymentMethod: WALLET` (external transfer + receipt photo) could previously only pick Vodafone Cash / InstaPay (validated as an Egyptian mobile number). **Bank transfer is now a third option**, validated as a bank account/IBAN instead of a phone number.

### New DTO Fields (on `POST /orders`, `POST /orders/custom-delivery`)

```json
{
  "paymentMethod": "WALLET",
  "transferType": "BANK_TRANSFER",       // or VODAFONE_CASH / INSTAPAY
  "transferAccountNumber": "EG380019000500000000263180002",   // required only for BANK_TRANSFER
  "transferNumber": "01012345678",       // required only for VODAFONE_CASH / INSTAPAY (unchanged validation)
  "transferImage": "<file upload>"       // always required, multipart field
}
```

`transferType` is now **required** whenever `paymentMethod: WALLET` (previously implicit). `transferNumber` keeps the exact same Egyptian-mobile regex validation it always had (`010`/`011`/`012`/`015`, 11 digits) — **fully backward compatible**, no change for existing Vodafone Cash / InstaPay integrations beyond adding the `transferType` field.

The admin/store approval flow (`PATCH /orders/:id/verify-payment`, see §16) needs **zero changes** — it's already payment-method-agnostic.

> **✅ Verified live:** Bank transfer without `transferAccountNumber` correctly rejected; with it, succeeded (status `PENDING_PAYMENT`, `transferNumber: null`). Vodafone Cash with an invalid (non-phone) number still correctly rejected with the old regex message — confirmed no regression.

---

## 16. Wallet-Transfer Payment Verification

Any `paymentMethod: WALLET` order (Vodafone Cash / InstaPay / Bank Transfer — see §15) now starts at:
- `status: "PENDING_PAYMENT"`
- `paymentStatus: "UNPAID"`

**No store notification, no driver search — until the receipt photo is reviewed by a human.** Previously the order was trusted and marked paid immediately without anyone looking at the image.

> `paidWithWallet: true` (paying from an already-funded in-app balance, not an external transfer) is a completely separate, unaffected flow.

### `PATCH /orders/:id/verify-payment`
**Auth:** Admin or Store (permission prefix `payment-verification`)

```json
{ "approved": true, "reason": "string (optional, sent to customer on rejection)" }
```

| Value | Result |
|---|---|
| `approved: true` | `status: PENDING`, `paymentStatus: PAID` → store notified, driver-assignment flow begins per §6 |
| `approved: false` | `status: PAYMENT_FAILD` → customer notified with reason |

`400` if the order isn't currently `PENDING_PAYMENT`.

### `GET /orders?status=PENDING_PAYMENT`
**Auth:** Admin/Store — queue of transfers awaiting review.

---

## 17. Custom Delivery — Three Kinds (Purchase / Restaurant / Online)

**"المندوب الخاص" has been split into three named kinds that all share the same driver pool, the same endpoints, and the same pricing/assignment logic — they only differ in a label.** This was a deliberate product decision: the frontend can show completely different copy ("محطة" vs "مطعم", "قائمة مشتريات" vs "قائمة أوردر") for what is mechanically the exact same order underneath, and the driver/admin can always tell which flavor a given job is.

`Order.customDeliveryKind` (new enum `CustomDeliveryKind`): `PURCHASE | RESTAURANT | ONLINE`. It's returned on every order response (was silently missing from the select object before this round — fixed, see §33).

### Purchase (`kind` omitted, or `kind: "PURCHASE"`)

The original "private courier" system — multi-stop errand ("buy X from here, drop it there"). Default kind, unchanged in behavior.

### Restaurant (`kind: "RESTAURANT"`)

**Mechanically 100% identical to Purchase** — same stations, same pricing, same validation, same driver-facing endpoints. The *only* difference is the value stored in `customDeliveryKind`. The frontend is responsible for swapping labels ("محطة" → "مطعم", "قائمة مشتريات" → "قائمة أوردر") based on this field; nothing else changes.

### Online (`kind` not applicable — its own endpoints, see §19)

The batched multi-recipient system for online sellers. Persisted on the same `Order`/`OrderStation` tables (`customDeliveryKind: ONLINE`) so it shares the same driver pool and the same `advance`/`finish` endpoints as Purchase/Restaurant, but has its own creation endpoints (`/orders/online-delivery...`) because its input shape (one sender + N recipients in one call) is different from a Purchase/Restaurant errand.

### Endpoints (Purchase & Restaurant — pass `kind` to pick the flavor)

- `POST /orders/custom-delivery/calculate` — price preview
- `POST /orders/custom-delivery` — create — body now optionally takes `"kind": "PURCHASE" | "RESTAURANT"` (default `PURCHASE` if omitted)
- `POST /orders/custom-delivery/images` — upload station photos before creating the order
- `PATCH /orders/custom-delivery/:id/advance` — driver moves to next stop — **same endpoint for all three kinds**, no branching needed
- `PATCH /orders/custom-delivery/:id/finish` — driver completes final stop → order `DELIVERED` — **same endpoint for all three kinds**

> **✅ Verified live (this round):** Created one order of each kind (`PURCHASE` default, `RESTAURANT` explicit, `ONLINE` via its own endpoint) — confirmed `customDeliveryKind` came back correct on every one, in both the create response and the driver's pending-assignment payload. Assigned all three to the **same** driver, accepted, and ran each through `advance`→`advance`→`finish` using the exact same two endpoints — all reached `DELIVERED` correctly, confirming the shared driver pool and shared endpoints work identically regardless of kind. Test orders and their wallet/transaction side-effects were cleaned up afterward.
>
> **🐛 Idempotency bug found + fixed:** the duplicate-submission guard (rejects the same order re-submitted within 20s) didn't check `customDeliveryKind` — a `PURCHASE` and a `RESTAURANT` request submitted back-to-back could incorrectly return the same cached order. Fixed by adding the kind to the match.

### On/Off Switch

| Setting Key | Type | Domain | Default |
|---|---|---|---|
| `customDeliveryEnabled` | `BOOLEAN` | `ORDER` | `true` |

**🚨 Bug fixed:** this toggle previously **never actually worked** — the code compared the real boolean value against the string `'false'`, which can never match. It's fixed now; confirmed live (disabled it, a create attempt was correctly rejected; re-enabled, succeeded).

### Pricing — Fully Independent from Store Delivery

Previously shared settings with regular store delivery pricing (changing one changed the other). Now fully separate — `domain: ORDER`:

| Setting Key | Type | Controls |
|---|---|---|
| `customDeliveryKMCharge` | `NUMBER` | Price per km |
| `customDeliveryBaseFee` | `NUMBER` | Flat fee per trip |
| `customDeliveryExtraStopPrice` | `NUMBER` | Fee per stop beyond the first two |
| `customDeliveryCommissionForAll` | `BOOLEAN` | Toggle: is platform commission charged on custom-delivery |
| `customDeliveryCommissionRate` | `NUMBER` | Commission value |
| `customDeliveryCommissionType` | `ENUM` | `PERCENTAGE` or `FIXED` |

**Formula:** `shipping = customDeliveryBaseFee + (totalDistanceKm × customDeliveryKMCharge)` — **unless the trip is exactly 2 stops (pickup + one dropoff) and the dropoff's zone has an app-wide price set (§20), in which case that flat price is used instead.**

> **✅ Verified live (this round):** Full lifecycle (calculate → create → assign → accept → advance → finish → DELIVERED) run end-to-end after the financial-system redesign (§25) — confirmed driver wallet credited correctly (`delivery` += shipping, `total`/`commission` += cash collected and its commission portion, exactly as expected).

---

## 18. Custom Delivery — Zone-Assisted Stops

Each stop in a `custom-delivery` order (`DeliveryStopDTO`) now optionally carries a `zoneId`:

```json
{ "lat": 24.7136, "lng": 46.6753, "label": "المستودع", "zoneId": 5 }
```

`lat`/`lng` remain the source of truth for geofencing and zone-coverage validation — the map is still required regardless. The intended frontend use: the customer picks a zone from a dropdown, the app fetches `GET /zones?cityId=` and uses the zone's coordinates to narrow/center the map search.

`GET /zones?cityId={id}` — already fully supported, filters zones by city, no changes needed.

> **⚠️ Product decision on pricing priority (updated this round):** for the 2-stop shortcut (§20), this `zoneId` the customer picked from the dropdown now **takes priority for pricing** over the zone resolved from the dropoff's real `lat`/`lng` — the opposite of a plain "reference only" field. If the picked zone has no price set, pricing falls back to the zone resolved from the real coordinates, then the km-formula. (An earlier pass this engagement briefly made this resolve-from-coordinates-only, treating the tag as display-only — that was intentionally reverted per an explicit, confirmed product decision: the picked zone should always win when it has a price.)

---

## 19. Online Delivery — Multi-Recipient Batch (Redesigned)

**Redesigned this round.** The original shape was one sender + one recipient per API call. It's now a **single order with one fixed sender + a batch of N recipients**, matching the product's actual UX: the seller enters their own info once, then taps "+ إضافة طلب" (add order) repeatedly to add each recipient with their own address and order details, and confirms everything together as **one order** at the end. The driver picks up once from the sender and delivers to each recipient in sequence — this reuses the same "1 pickup + N dropoff stations" primitive Purchase/Restaurant custom-delivery already used, so **no changes were needed to the driver-facing `advance`/`finish` endpoints** to support it.

Still zone-based only — no map/location needed anywhere in this flow (unchanged from before).

### `GET /orders/online-delivery/seller-profile`
**Auth:** Customer — returns the caller's saved seller profile (`null` if none saved yet).

```json
{ "userId": 11, "senderName": "متجر ندى", "senderPhone": "01011112222", "pickupZoneId": 1 }
```

### `POST /orders/online-delivery/calculate`
**Auth:** Customer — pricing preview, same body as create below.

### `POST /orders/online-delivery`
**Auth:** Customer

```json
{
  "isOnlineSeller": true,
  "senderName": "متجر ندى",
  "senderPhone": "01011112222",
  "pickupZoneId": 1,
  "recipients": [
    {
      "recipientName": "أحمد علي",
      "recipientPhone": "01098765432",
      "deliveryZoneId": 2,
      "addressDetails": "شارع النصر، عمارة 12، الدور 3، شقة 5",
      "itemsDescription": "فستان مقاس M",
      "estimatedCost": 300,
      "collectionAmount": 300,
      "packagingRequested": false,
      "notes": "برجاء الاتصال قبل الوصول"
    },
    {
      "recipientName": "منى سمير",
      "recipientPhone": "01098765433",
      "deliveryZoneId": 3,
      "addressDetails": "شارع آخر، عمارة 9",
      "itemsDescription": "حذاء مقاس 40",
      "estimatedCost": 500,
      "collectionAmount": 500,
      "packagingRequested": true
    }
  ],
  "paymentMethod": "CASH",
  "note": "string (optional, whole-order level)",
  "tip": 0
}
```

- **`recipients` is the "+ إضافة طلب" batch** — at least one required, no upper limit. Each entry becomes one `DROPOFF` `OrderStation` (sequence 2, 3, 4…), after a single `PICKUP` station built from the sender fields (sequence 1). The whole batch is priced, paid, and confirmed together as **one** `Order`.
- `senderName`/`senderPhone`/`pickupZoneId` are **optional** on every call after the first — if omitted, the previously-saved seller profile is used automatically (`isOnlineSeller: true` saves/refreshes it).
- Per-recipient `collectionAmount` — cash the driver should collect from that specific recipient. **Recorded as data only for now** — not yet wired into any wallet/settlement logic; the actual financial flow for this money is planned as a separate, later pass ("ضبط الحسابات والفاينانسنج").
- Per-recipient `packagingRequested` — each recipient can independently ask for packaging; `Order.packagingFee` is the sum across whichever recipients requested it (not a whole-order flag anymore).
- `Order.zoneId` (the auto-resolved delivery zone used for coupon logic, etc.) is set from the **last** recipient's zone, matching the same "resolve from the final stop" convention Purchase/Restaurant already used for multi-stop trips.
- No `lat`/`lng` anywhere in this flow — every zone (`pickupZoneId` and each recipient's `deliveryZoneId`) is resolved server-side to a representative point (the zone polygon's vertex centroid) so the existing assignment/geofence machinery still has coordinates to work with, entirely transparently to the client.
- `Order.recipientName`/`recipientPhone`/`deliveryAddressDetails` (the old single-recipient fields) were **removed** from `Order` — this data now lives per-recipient on `OrderStation` (`name`, `contactPhone`, `addressDetails`), since there can be more than one.

### New Settings

| Setting Key | Type | Domain | Default | Controls |
|---|---|---|---|---|
| `onlineDeliveryEnabled` | `BOOLEAN` | `ORDER` | `true` | On/off switch, independent from `customDeliveryEnabled` |
| `onlineDeliveryBaseFee` | `NUMBER` | `ORDER` | `15` | Flat delivery fee **per recipient** (no per-km calculation) — unless that recipient's zone has an app-wide price (§20), which takes priority |
| `onlineDeliveryCommission` | `NUMBER` | `ORDER` | `0` | Flat platform commission **per recipient** |
| `packagingFee` | `NUMBER` | `ORDER` | `5` | Flat optional packaging add-on price, per recipient that requests it |

> **✅ Verified live (this round):** Created a batch order with one sender and two recipients in a single call — confirmed it created exactly one `Order` with one `PICKUP` + two `DROPOFF` stations, each carrying its own name/phone/address/collection amount/packaging flag correctly. Confirmed `packagingFee` summed only the recipient who requested it, and shipping summed both recipients' per-zone/base fees correctly. Assigned to a driver, accepted, and ran the **exact same** `advance`/`advance`/`finish` endpoints Purchase/Restaurant use — reached `DELIVERED` with zero code changes needed on the driver side, confirming the station-reuse design. Test order and its wallet side-effects were cleaned up afterward.

---

## 20. Zone-Based Delivery Pricing — App-Wide

Admins can now set a **fixed delivery price per zone** that applies **everywhere in the app** — regular store/restaurant delivery, Purchase/Restaurant custom-delivery (2-stop trips), and every recipient in an Online-delivery batch. Where a zone has no price set, everything falls back to the pre-existing base-fee-plus-per-km formula, completely unchanged. This is purely additive — the commission/platform-fee settings are **entirely unrelated and untouched**.

### `PATCH /zones/:id` (existing endpoint, new field)
**Auth:** Admin

```json
{ "deliveryPrice": 42 }
```

`deliveryPrice` is optional/nullable on `Zone` (also settable on `POST /zones` at creation). Omit it (or leave it `null`) to keep using the km-formula for that zone. `GET /zones` / `GET /zones/:id` now return it too (**🐛 fixed this round** — the field existed and could be set, but was missing from the response select object, so admins could never see back what they'd set).

### Where it applies, and priority order

| Flow | Priority order |
|---|---|
| Regular store/restaurant delivery (`HelpersService.getDeliveryPrice`) | 1) The zone the customer **picked from the dropdown** (`customerSelectedZoneId`, §22), if it has a price. 2) Else the zone **resolved from the address's real lat/lng**, if it has a price. 3) Else the km-formula. |
| Purchase/Restaurant custom-delivery, exactly 2 stops (`getCustomDeliveryPrice`) | 1) The zone the customer **tagged on the dropoff stop** (`DeliveryStopDTO.zoneId`, §18), if it has a price. 2) Else the zone **resolved from the dropoff's real lat/lng**, if it has a price. 3) Else the km-formula. 3+ stop trips always use the km-formula regardless (a flat zone price isn't well-defined for a real multi-stop errand). |
| Online delivery, each recipient | Zone resolved from `deliveryZoneId` directly (there's no lat/lng in this flow to begin with — see §19) → its price used, else `onlineDeliveryBaseFee` |

> **⚠️ Product decision, confirmed explicitly:** the customer-picked zone wins over the real GPS/address-resolved zone whenever it has a price — this is deliberate, not a fallback-only reference field like it is everywhere else in the app. If the frontend needs "charge by real location, ignore what the customer picked," that would require flipping the priority order back — ask before changing this, it was reversed once already this engagement after re-confirming the requirement.
>
> **✅ Verified live (this round):** Tagged a regular order with a zone unrelated to the real address zone — shipping matched the *tagged* zone's price, not the real one. Cleared that zone's price — fell back to the real address's zone price / km-formula correctly. Same test repeated for the 2-stop custom-delivery shortcut with identical results.

---

## 21. Store-Specific Zone Pricing — Per-Store Override

On top of the app-wide zone pricing above, **an individual store can set its own delivery price per zone**, overriding the app-wide price/km-formula **for that store's own regular delivery orders only** (never for Purchase/Restaurant/Online custom-delivery pricing, which always stays app-wide). This is **opt-in per store, admin-controlled** — a store cannot turn this on for itself.

### `PATCH /stores/:id/zone-pricing/toggle`
**Auth:** Admin only

```json
{ "enabled": true }
```

Turning it off does not delete the store's saved zone prices — they just stop applying until re-enabled.

### `GET /stores/:id/effective-zone-prices` — **use this one for the customer app's zone picker**
**Auth:** Visitor (fully public, no login required)

The one the mobile app should call while a customer is ordering **from this specific store** — not `GET /zones`, which is store-agnostic and won't reflect this store's own overrides. Returns the price that will **actually be charged** per zone for a regular order from this store: this store's own price if `zonePricingEnabled` and set, else the app-wide zone price (§20), else `null` (km-formula applies).

```json
{
  "data": [
    { "zoneId": 1, "name": { "ar": "وسط القاهرة", "en": "Central Cairo" }, "cityId": 1, "price": 33 },
    { "zoneId": 2, "name": { "ar": "منطقة 2", "en": "Zone 2" }, "cityId": 2, "price": 44 },
    { "zoneId": 3, "name": { "ar": "منطقة 3", "en": "Zone 3" }, "cityId": 3, "price": null }
  ]
}
```

In the example above: zone 1 has this store's own override (33), zone 2 has no store override so it falls back to the app-wide zone price (44), zone 3 has neither so `price: null` — the app should fall back to showing "calculated at checkout" (km-formula) for that one.

> **✅ Verified live (this round):** Set a store-specific price on one zone and an app-wide price on a different zone (no store override), left a third zone with no price anywhere — called this endpoint with **no auth token at all** and got back exactly the right effective price for all three, confirming it's genuinely usable by an anonymous/customer mobile session. Confirmed the management endpoint below still correctly rejects a customer session with `403` — this new endpoint doesn't loosen that boundary, it's a separate, deliberately public one.

### `GET /stores/:id/zone-prices` — admin/store management view
**Auth:** Store (own store only) or Admin — the "template" list: every admin-defined active zone, plus this store's own price for it (`null` if unset yet). Shows the **raw configured price regardless of whether `zonePricingEnabled` is currently on** (so a store/admin can review/re-enable), unlike the customer-facing endpoint above.

```json
{
  "zonePricingEnabled": true,
  "zones": [
    { "zoneId": 1, "name": { "ar": "وسط القاهرة", "en": "Central Cairo" }, "cityId": 1, "price": 66 },
    { "zoneId": 2, "name": { "ar": "منطقة 2", "en": "Zone 2" }, "cityId": 2, "price": null }
  ]
}
```

### `PATCH /stores/:id/zone-prices`
**Auth:** Store (own store only) or Admin — upserts a batch of prices in one call.

```json
{ "zonePrices": [ { "zoneId": 1, "price": 66 }, { "zoneId": 2, "price": 30 } ] }
```

Rejected with a clear `400` if the admin hasn't enabled zone pricing for this store yet ("Zone pricing is not enabled for this store — ask the platform admin to enable it first").

### `DELETE /stores/:id/zone-prices/:zoneId`
**Auth:** Store (own store only) or Admin — clears one override, reverting that zone back to the app-wide price/km-formula for this store.

### Priority order (regular delivery only)

**Store's own zone price → app-wide zone price (§20) → km-formula.** Custom-delivery (Purchase/Restaurant/Online) never looks at store-specific pricing at all.

> **✅ Verified live (this round):** Confirmed a store cannot set prices while disabled (`400`), and cannot toggle the switch itself (`403 Forbidden` — admin-only permission). Admin enabled it → store set its own price for a zone → a real order for that store/zone charged exactly that price. Admin disabled it again → the same order scenario correctly fell back to the km-formula, proving the toggle gates the override in both directions. Test data (orders, zone prices, toggle state) cleaned up afterward.

---

## 22. Customer-Selected Zone — Regular Orders

Lets the customer pick a zone from a dropdown on regular (restaurant/store) orders too, mirroring the same field custom-delivery stops already had (§18).

### `POST /orders` (existing endpoint, new field)

```json
{ "branchId": 1, "addressId": 1, "zoneId": 5, "items": [ { "serviceId": 1, "quantity": 1 } ], "paymentMethod": "CASH" }
```

`zoneId` here → stored as `Order.customerSelectedZoneId`, returned on every order response. **Takes priority for pricing over the address's real, auto-resolved zone (`Order.zoneId`) whenever the picked zone has a price set (§20)** — this was originally built as display-only, then deliberately reversed this engagement per an explicit product decision. `Order.zoneId` (the auto-resolved zone) is still computed and stored as before, for coupon-zone logic and as the pricing fallback when the picked zone has no price of its own.

> **✅ Verified live (this round):** Placed an order with `zoneId` pointing at a priced zone unrelated to the actual delivery address — `shipping` matched that picked zone's price, not the real address's zone or the km-formula. Cleared that zone's price — the same order correctly fell back to the real address's zone price, then the km-formula.

---

## 23. Google Sign-In — Customer Auth

**Customer-only** "Sign in with Google" — one call both registers (first time) and logs in (every time after), same response shape as the existing `/login/:roleKey`.

### `POST /authentication/google`

```json
{ "locale": "en", "idToken": "<ID token from the Google Sign-In SDK on the client>", "fcm": "device fcm token (optional)" }
```

**Response:** identical shape to `POST /authentication/login/:roleKey` (`user`, `AccessToken`, `RefreshToken`, `unReadNotifications`).

- The mobile app runs the native Google Sign-In flow and sends us the resulting **ID token only** — we never see the user's Google password.
- **First time:** creates a new, pre-verified customer (Google already verified the email, so there's no OTP step).
- **Returning user:** found by the stored Google account id.
- **Existing email/password account, first Google login:** if a customer already exists with that email (registered the normal way), the Google account gets **linked** onto it (not a duplicate) and it becomes verified if it wasn't already.

### ⚠️ Setup required before this works

Set `GOOGLE_CLIENT_IDS` in the environment — a comma-separated list of the OAuth client ID(s) the mobile team registers in Google Cloud Console (Android/iOS/Web can each have a different one; all of them go in this one variable). **Until this is set, every call is rejected with a clear `500` config error** — this is intentional, not a bug, so the endpoint can't be misused before it's actually configured.

> **✅ Verified live (this round):** Confirmed the endpoint is correctly locked down with a clear error while `GOOGLE_CLIENT_IDS` is unset. Confirmed a garbage/invalid ID token is rejected (`invalid_google_token`) once a client ID is configured — this proved the live call to Google's token-verification endpoint actually works end-to-end from this server. Exercised the account-matching logic directly against the real database (can't fully simulate without a real signed Google token): new-user creation, idempotent re-login on the same Google account, and linking onto an existing email/password customer — all three behaved correctly. Test data cleaned up, config reverted to unset.

---

## 24. Admin Notifications — Image + Driver Deep Link

Admin's manual broadcast notifications (`AdminNotification`) now support an image and can deep-link to a specific driver's profile, matching what `Campaign` already supported.

### `POST /admin-notifications` (multipart — required once an image is attached)
**Auth:** Admin

```
title: {"ar":"عرض خاص","en":"Special Offer"}
body: {"ar":"...","en":"..."}
targetType: ALL | CUSTOMER | STORE | DELIVERY | SELECTED_USERS
clickTargetType: SPECIAL_DRIVER   (or STORE / CATEGORY / SERVICE / ZONE / ORDER / COUPON / EXTERNAL_URL / GENERAL)
clickDeliveryId: 12               (required when clickTargetType = SPECIAL_DRIVER, must be a real driver)
image: <file>                     (optional, multipart field)
```

The image is included in the FCM push payload (`imageUrl` for Android/notification, `apns.payload.image` + `mutable-content` for iOS rich notifications) and persisted on every recipient's `Notification` row.

> **⚠️ Multipart gotcha:** once any field requires a file upload, ALL numeric fields in the body arrive as strings from the client — every numeric field on this DTO now has `@Type(() => Number)` to coerce correctly. If you add new numeric fields to this DTO later, remember the same transform or they'll silently fail validation only when an image is attached.

> **✅ Verified live (this round):** Sent a real notification with an image + `clickDeliveryId` to 16 recipients — confirmed every recipient's `Notification` row has both the correct `image` path and `clickDeliveryId`.

---

## 25. Financial System Redesign — Driver Wallet

**Complete redesign.** Previously `GET /delivery/me/wallet` returned one flat, confusing number (`wallet`) that mixed the driver's actual delivery earnings together with however much cash they were currently holding — impossible to show cleanly in a UI.

### `GET /delivery/me/wallet`
**Auth:** Driver

```json
{
  "total": 75.59,          // gross cash the driver is currently holding, awaiting settlement (was collectedCash)
  "commission": 13,         // the platform-commission + tax portion embedded in that cash — driver owes this back
  "delivery": 5.18,         // driver's own cumulative delivery-fee earnings — this is what they can withdraw
  "pendingWithdraw": 0,
  "totalWithdrawn": 0
}
```

**Key change:** `delivery` (formerly the single `wallet` field) is now **pure delivery-fee earnings**, credited on every order regardless of payment method, and only ever decremented by an approved withdrawal. It is **no longer netted against cash collected** — cash custody and earnings are now two fully independent numbers. This is also what fixed the withdrawal cap: a driver can never withdraw more than their real delivery earnings, even while holding a lot of un-settled cash.

`commission` is a new tracked field (`Details.unsettledCommission`) — computed as `adminCommission + tax` per cash order (not `adminCommission + storeCommission`, since `adminCommission` already includes the store-commission portion; adding both would double-count).

### `POST /delivery/me/withdraw`
**Auth:** Driver

```json
{ "amount": 10, "payoutMethod": "CASH", "payoutDetails": "reference text" }
```

`payoutMethod` is now `CASH | VODAFONE_CASH | INSTAPAY` (previously `VODAFONE_CASH | INSTAPAY | BANK` — `BANK` removed, `CASH` added — matches the product decision to drop bank-account-based payouts entirely). No bank account entity required, ever — just a free-text `payoutDetails` string typed fresh each time.

**Errors:** `400 "Not enough balance"` (checked against `delivery`, not the old net figure) / `400 "Pending withdraw found"` (one open request at a time).

### `GET /delivery/me/withdrawals` / `GET /delivery/withdrawals` (admin) / `PATCH /delivery/withdrawals/:id` (admin approve/deny)

Unchanged shape — approving decrements `delivery` and increments `totalWithdrawn`; denying just releases the pending hold.

### `POST /delivery/cash-settlements` (admin) — Cash Handover

```json
{ "deliveryId": 12, "amount": 37.79, "note": "string (optional)" }
```

No approval step — creating this row IS the confirmation. Decrements `total` (cash held) by the settled amount, **and now also proportionally decrements `commission`** — e.g. settling exactly half the held cash releases exactly half the commission owed on it, so the two numbers stay consistent under partial settlements.

> **✅ Verified live:** Full order lifecycle with real commission/tax settings enabled, confirmed `commission` computed exactly as `adminCommission + tax` (13 = 10 + 3). Confirmed a second, non-cash order added only to `delivery` and left `total`/`commission` untouched. Confirmed withdrawal correctly capped at `delivery`, not the old mixed figure. Confirmed a 50%-of-held-cash settlement dropped `commission` by exactly 50%, not more or less.

---

## 26. Financial System Redesign — Store Wallet

**🚨 Real bug fixed:** `GET /stores/me/wallet` was silently reading from the **driver's** `Details` table (keyed by `userId`) instead of the store's actual `Wallet` table (keyed by `branchId`) — it returned meaningless/empty data for every store, always. Not a display nuance — the endpoint was completely broken.

### `GET /stores/me/wallet`
**Auth:** Store

```json
{
  "total": 90,                 // currentBalance, summed across every branch of the store, withdrawable
  "commissionDeducted": 0,     // cumulative platform commission taken from this store's orders — transparency figure, no balance effect
  "pendingWithdraw": 0,
  "totalWithdrawn": 10
}
```

Only **two** numbers (not three like the driver) — a store never physically holds customer cash the way a driver does (the driver collects COD cash, not the store), so there's no "cash held" concept to show here. If the store has multiple branches, `total`/`commissionDeducted` are summed across all of them.

### `POST /withdraw`
**Auth:** Store

```json
{ "amount": 10, "branchId": 1, "payoutMethod": "CASH", "payoutDetails": "reference text" }
```

**Same simplification as the driver side** — `payoutMethod: CASH | VODAFONE_CASH | INSTAPAY`, no bank account required (see §27). `branchId` must be sent explicitly by the client (a store with multiple branches picks which one).

### `GET /withdraw` / `PATCH /withdraw/:id` (admin approve/deny)

Filterable by `branchId`/`storeId`/`status`. Approving decrements `Wallet.currentBalance` and increments `totalWithdrawn`.

> **✅ Verified live:** Confirmed `GET /stores/me/wallet` now returns real `Wallet` data. Created and approved a withdrawal with no bank account at all — confirmed `total` dropped by exactly the withdrawn amount.

---

## 27. Financial System Redesign — Withdrawals (No More Bank Accounts)

**The entire `BankAccount`/`Bank` system (Bank name + IBAN, store/branch-scoped) has been removed** — it was only ever used by the store withdrawal flow, and nothing else in the codebase referenced it. Both driver and store withdrawals now use the same lightweight shape:

```json
{ "amount": 10, "payoutMethod": "CASH | VODAFONE_CASH | INSTAPAY", "payoutDetails": "free text" }
```

### ⚠️ Breaking Changes

- `POST /withdraw`'s body no longer accepts `storeAccountId` — send `branchId` + `payoutMethod` + `payoutDetails` instead.
- `PayoutMethod` enum dropped `BANK`, added `CASH` — this affects both `POST /withdraw` (store) and `POST /delivery/me/withdraw` (driver).
- The endpoints `POST/PATCH/GET/DELETE /bankAccounts` and `GET/POST/PATCH/DELETE /banks` **no longer exist** — remove any frontend screens/calls referencing them.

---

## 28. Financing Double-Crediting Bug — Fixed

**Branch/admin wallets were credited twice on every wallet-paid order** (`paidWithWallet: true`) — once eagerly at order creation, and again at `DELIVERED` via the earnings-distribution step. `CASH` orders never had this bug (they only credited at `DELIVERED`). Fixed by removing the eager crediting — `DELIVERED` is now the single source of truth for every payment method, matching how `CASH` always worked. `refundOrder()` on `CANCELLED` updated to match (only refunds the customer — branch/admin were never credited pre-delivery, so there's nothing to reverse for them).

Also fixed: `getOrderById`'s select was missing `paidWithWallet`, which had silently disabled the cancellation-refund guard for wallet-paid `CASH` orders.

> **✅ Verified live:** Walked a wallet-paid order to `DELIVERED` — branch balance moved by the exact expected amount exactly once. Cancelled a separate one — only the customer was refunded.

---

## 29. Dashboard Reset Period

A **manual checkpoint, not a data delete.** Stats start counting from the reset date; historical data via `fromDate`/`toDate` filters is unaffected.

### `POST /statistics/reset-period` (Admin) / `POST /statistics/store/reset-period` (Store)

**Response:** `{ "periodStartedAt": "2026-07-07T01:12:49.941Z" }`

### `GET /statistics` — Admin, includes:

```json
{
  "currentPeriod": { "periodStartedAt": "string | null", "totalRevenue": "number", "totalCommission": "number", "totalOrders": "number" },
  "driverFinance": { "pendingWithdrawalsCount": "number", "pendingWithdrawalsAmount": "number", "totalCollectedCashOutstanding": "number", "totalDriverWalletBalance": "number" }
}
```

`GET /statistics/store` (Store) gets the same `currentPeriod` object, scoped to the calling store.

---

## 30. All New/Changed Settings — Full Reference

Every setting added or changed across this whole engagement, all read/written via `GET /settings?domain=X` / `PATCH /settings` (admin only):

| Setting Key | Type | Domain | Default | Notes |
|---|---|---|---|---|
| `deliveryAssignmentMode` | `ENUM` | `DELIVERY` | `AUTO` | `AUTO` \| `MANUAL` — pre-existing, now correctly wired to the delayed-assignment flow (§6) |
| `driverAssignmentDelaySeconds` | `NUMBER` | `DELIVERY` | `480` | New — wait time after store acceptance before AUTO-searching for a driver |
| `deliveryAcceptanceTimer` | `NUMBER` | `DELIVERY` | `90` | Pre-existing — seconds a driver has to respond to an offer |
| `deliveryAfkBreakMinutes` / `deliveryAfkBreakEnabled` | `NUMBER` / `BOOLEAN` | `DELIVERY` | `15` / `false` | Pre-existing |
| `pickupGeofenceRadiusMeters` | `NUMBER` | `DELIVERY` | `1500` | §7 |
| `deliveryGeofenceRadiusMeters` | `NUMBER` | `DELIVERY` | `1500` | §7 |
| `pickupEnabled` | `BOOLEAN` | `ORDER` | `true` | New — §14 |
| `customDeliveryEnabled` | `BOOLEAN` | `ORDER` | `true` | Pre-existing — bug fixed this engagement, §17 |
| `customDeliveryKMCharge` / `customDeliveryBaseFee` | `NUMBER` | `ORDER` | `2` / `2` | §17 |
| `customDeliveryExtraStopPrice` | `NUMBER` | `ORDER` | `0` | §17 |
| `customDeliveryCommissionForAll` / `Rate` / `Type` | `BOOLEAN` / `NUMBER` / `ENUM` | `ORDER` | `true` / `0` / `FIXED` | §17 |
| `onlineDeliveryEnabled` | `BOOLEAN` | `ORDER` | `true` | New — §19 |
| `onlineDeliveryBaseFee` | `NUMBER` | `ORDER` | `15` | New — §19 |
| `onlineDeliveryCommission` | `NUMBER` | `ORDER` | `0` | New — §19 |
| `packagingFee` | `NUMBER` | `ORDER` | `5` | New — §19 |
| `adminDashboardPeriodStartAt` | `DATE` | `BUSINESS` | `''` | Pre-existing — §29 |

**Every `BOOLEAN` setting is read as a real JS `true`/`false`** by `getSettings()` — never compare it against the string `'false'` (a real bug we found and fixed on `customDeliveryEnabled` this engagement; every boolean gate listed above uses the correct `=== false`/`=== true` comparison).

---

## 31. Auth — Refresh Token Lifetime

Refresh tokens were silently capped at the same 1-day expiry as access tokens regardless of `REFRESH_TOKEN_EXPIRE_TIME`. They now actually live for the configured 7 days. No request/response shape changed.

---

## 32. Misc Fixes

- **`GET /search`** — was open to anonymous callers, now requires a logged-in session.
- **`PATCH /orders/:id/:status`** — `lat`/`lng` for `ON_THE_WAY`/`DELIVERED` must be sent in the **request body**, not as route params (there's no `:lat/:lng` segment in the route — every real driver call for these transitions used to fail).
- **`PATCH /orders/:id/unassign`** — previously left order status untouched (e.g. stuck on `ON_THE_WAY` with no driver); now correctly resets to `READY_PICKUP` and clears `deliveryId`.
- **Withdrawal ledger entries** — previously logged at *request* time (denied requests left stale ledger rows implying money moved when it hadn't); now logged only on *approval*, for both driver and store withdrawals.

---

## 33. Prisma Schema — What Changed

For whoever runs the next `npm run db:sync` / deploy — full list of schema changes this engagement, already pushed and verified against the dev database.

### This round (segmentation, zone pricing, Google sign-in)

**Changed on `Order`:** `customDeliveryKind` now `PURCHASE | RESTAURANT | ONLINE` (added `RESTAURANT`); **removed** `recipientName`, `recipientPhone`, `deliveryAddressDetails` (superseded by per-recipient fields on `OrderStation`, since Online orders can have multiple recipients now); new `zoneId` (auto-resolved delivery zone, used for pricing/coupon logic) and new `customerSelectedZoneId` (display-only, §22) — two separate relations to `Zone`, so a named Prisma relation (`"CustomerSelectedZone"`) was needed since there are now two FKs to the same model.

**Changed on `OrderStation`:** new `collectionAmount` (per-recipient cash to collect, data-only for now), `addressDetails` (per-recipient full address, was order-level before), `packagingRequested` (per-recipient, was order-level before).

**Changed on `Zone`:** new `deliveryPrice` (nullable — app-wide fixed price, §20).

**New model `StoreZonePrice`:** `storeId`, `zoneId`, `price`, unique per store+zone — a store's own per-zone price override (§21).

**Changed on `Store`:** new `zonePricingEnabled` (admin-only switch, §21).

**Changed on `User`:** new `googleId` (nullable, unique — Google account link, §23).

### Earlier this engagement (unchanged from last handoff)

**New/changed on `Order`:** `packagingFee`, `assignmentReadyAt`, `transferType` (enum), `transferAccountNumber`. Mirrored onto `ArchivedOrder` where relevant (`transferType`, `transferAccountNumber`).

**New models:** `OnlineSellerProfile` (online-seller saved profile).

**New enums:** `TransferType` (`VODAFONE_CASH`/`INSTAPAY`/`BANK_TRANSFER`).

**Changed on `Details` (driver):** new `unsettledCommission` field.

**Changed on `Wallet` (store/branch):** new `totalCommissionDeducted` field; removed unused `collectedCash` field.

**Changed on `Store`:** removed dead `walletId`/`wallet` relation (was never read anywhere in code).

**Changed on `Withdraw`:** removed `storeAccountId`, added `branchId` (direct field, was previously only reachable via the now-deleted `BankAccount`), `payoutMethod`, `payoutDetails`.

**Changed enum `PayoutMethod`:** `BANK` removed, `CASH` added — now `CASH | VODAFONE_CASH | INSTAPAY`.

**Removed entirely:** `BankAccount` model, `Bank` model, and their modules/controllers/permissions.

`npx prisma validate` and a full `db push` were run clean against the dev database after every change — no pending schema drift as of this handoff.

---

## 34. Summary Table

| # | Area | Type | Impact |
|---|------|------|--------|
| 3 | Store approval gate | 🆕 New | Self-registered stores start pending |
| 4 | Remove store template | 🆕 New | `DELETE /stores/:id/apply-template/:templateId` |
| 5 | Employees | 🐛 Fixed | Was completely non-functional; `roleKey`→`roleId` breaking change |
| 6 | Order lifecycle | 🚨 Fixed twice | Store notified first; driver assignment now delayed 8min in AUTO mode, immediate no longer |
| 7 | Geofence radius | 🆕 New | Admin-tunable pickup & delivery radii |
| 8 | Geofence "out of range" | 🔍 Diagnosed | No code bug found after 2 audits; diagnostic logging added for next occurrence |
| 9 | Scheduled orders | 🐛 Fixed | Orders now convert at `scheduledAt` |
| 10 | Store ordering | ✅ Confirmed | `storeOrder` sort works; return-payload gap fixed |
| 11 | Reorder | 🆕 New | `POST /orders/:id/reorder`, re-prices from scratch |
| 12 | Store schedule | 🔍 Diagnosed | Cron works correctly; symptom is a stuck manual override, no code bug |
| 13 | Category search | ✅ Confirmed | Manually-added categories already searchable, no change needed |
| 14 | Pickup toggle | 🆕 New | `pickupEnabled` setting |
| 15 | Bank transfer payment | 🆕 New | Third `transferType`, own validation |
| 16 | Wallet-transfer verification | 🆕 New | `PATCH /orders/:id/verify-payment` |
| 17 | Custom delivery on/off | 🚨 Critical fix | Toggle silently never worked (string-vs-boolean bug) |
| 17 | Custom delivery pricing | 🆕 New | Fully independent settings |
| 17 | 3-way segmentation | 🆕 New | `customDeliveryKind`: `PURCHASE`/`RESTAURANT`/`ONLINE`, same driver pool + endpoints |
| 17 | Kind missing from select | 🐛 Fixed | `customDeliveryKind` existed on the order but was never returned in any API response |
| 17 | Idempotency gap | 🐛 Fixed | Duplicate-guard didn't check `kind`; PURCHASE/RESTAURANT submitted back-to-back could collide |
| 18 | Custom delivery zones | 🆕 New | `zoneId` per stop, assist-only |
| 18 | Zone-price pricing-integrity | 🐛 Fixed | 2-stop pricing trusted the reference-only `zoneId` tag instead of the real coordinates |
| 19 | Online delivery | 🚨 Redesigned | Now one order + N-recipient batch (was 1 sender + 1 recipient per call) |
| 20 | App-wide zone pricing | 🆕 New | Fixed price per zone, whole app, km-formula fallback |
| 20 | Zone select missing price | 🐛 Fixed | `deliveryPrice` could be set but never returned by `GET /zones` |
| 21 | Store-specific zone pricing | 🆕 New | Per-store override, admin opt-in per store |
| 22 | Customer-selected zone | 🆕 New | Reference-only `zoneId` on regular orders |
| 23 | Google Sign-In | 🆕 New | `POST /authentication/google`, customer-only |
| 24 | Admin notifications | 🆕 New | Image + `SPECIAL_DRIVER` deep link |
| 25 | Driver wallet | 🚨 Redesigned | 3 independent numbers instead of 1 confusing net figure |
| 26 | Store wallet | 🚨 Critical fix | Endpoint was reading the wrong table entirely |
| 27 | Withdrawals | 🚨 Redesigned | Bank-account system removed; unified lightweight payout for both sides |
| 28 | Double-crediting bug | 🚨 Critical fix | Branch/admin no longer credited twice on wallet-paid orders |
| 29 | Dashboard reset period | 🆕 New | `POST /statistics/reset-period` |
| 31 | Refresh token lifetime | 🐛 Fixed | Now actually 7 days |
| 32 | Search auth / unassign / ledger | 🐛 Fixed | See details above |

---

*Every endpoint above was exercised with a real logged-in request against the running server, across multiple audit passes. Test data created during verification was cleaned up afterward.*
