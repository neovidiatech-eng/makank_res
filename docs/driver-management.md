# Driver Management (Cards Listing & Details Dashboard)

## Overview

The admin dashboard's **Driver Management** surface has two views, both served by the existing
`delivery` module:

1. **Drivers listing** — a paginated, searchable grid of driver *cards* (one request returns
   everything each card needs).
2. **Driver details dashboard** — a per-driver, per-day view with profile, order statistics, a
   financial summary, an acceptance summary, and that day's orders table.

Two endpoints were **added**; all pre-existing delivery endpoints (`GET /delivery/all`,
`GET /delivery/:id`, register, schedule, location, `me/*`, …) are **untouched** and remain valid for
their current consumers.

## API

### 1. Drivers listing (cards)

```
GET /api/delivery
GET /api/delivery?page=1&limit=10
GET /api/delivery?search=ahmed          # matches name OR email OR phone
```

**Query parameters** (all optional):

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number. |
| `limit` | number | `10` | Page size. Capped at `MAX_PAGE_LIMIT` (env, currently 40). `-1` returns all rows. |
| `search` | string | — | Case-insensitive `contains` over **name**, **email**, and **phone**. |

Results are scoped to the `DELIVERY` role and ordered by `createdAt desc`.

**Response**

```jsonc
{
  "message": "Deliveries fetched successfully",
  "data": [
    {
      "id": 12,
      "name": "Ahmed Ali",
      "email": "ahmed@x.com",
      "phone": "+2012...",
      "avatar": "uploads/a.png",   // null when no profile image
      "isVerified": true,
      "isAvailable": false,         // "متاح إجباري" — always-available toggle (forceAvailable)
      "isOnShift": true,            // "شغال النهاردة" — live shift status (availableNow)
      "createdAt": "2026-05-01T10:00:00.000Z"
    }
  ],
  "total": 37,
  "pagination": { "page": 1, "limit": 10, "total": 37, "totalPages": 4 }
}
```

`total` is kept at the top level for backward-compatibility with the existing response envelope; the
full `pagination` object (`page`, `limit`, `total`, `totalPages`) is the canonical metadata for the
new UI.

### 2. Driver details dashboard

```
GET /api/delivery/:id/dashboard
GET /api/delivery/:id/dashboard?date=2026-06-04
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `date` | date (`YYYY-MM-DD`) | **today** | The calendar day the dashboard reports on. |

Returns `404` if `:id` is not a `DELIVERY`-role user.

**Response**

```jsonc
{
  "message": "Driver dashboard fetched successfully",
  "data": {
    "profile": {
      "id": 12, "name": "Ahmed Ali", "email": "ahmed@x.com", "phone": "+2012...",
      "avatar": "uploads/a.png", "isVerified": true, "isAvailable": false, "isOnShift": true
    },
    "statistics": {
      "selectedDate": "2026-06-04",
      "acceptedOrders": 8,
      "rejectedOrders": 0,
      "deliveredOrders": 5
    },
    "financialSummary": {
      "totalOrdersAmount": 2857.82,   // Σ Order.totalPriceAfterDiscount
      "deliveryFees": 2056.82,        // Σ Order.shipping
      "adminCommission": 0            // Σ Order.adminCommission
    },
    "acceptanceSummary": { "acceptedOrders": 8, "rejectedOrders": 0 },
    "orders": [
      {
        "id": 70,
        "customerName": "fahd hake",
        "customerPhone": "+2001...",
        "storeName": { "ar": "...", "en": "test" },   // multilingual JSON, localized by ResponseService
        "productsSummary": [ { "quantity": 1, "name": { "ar": "...", "en": "x1test" } } ],
        "invoiceTotal": 231.38,
        "deliveryPrice": 200,
        "notes": null,
        "status": "DELIVERED",
        "createdAt": "2026-06-04T14:32:00.000Z"
      }
    ]
  }
}
```

`storeName` and each `productsSummary[].name` are returned as raw `{ ar, en }` JSON and resolved to
the request locale by the shared response localizer (`localizedObject`). Keeping `productsSummary`
as an array of `{ quantity, name }` (rather than a pre-flattened string) preserves per-item
translation.

## How the numbers are computed

All financial values are **summed from fields already persisted on the `Order` row** at
creation/completion time — pricing logic is **never** recomputed here (no duplication of the order
service's calculations):

| Dashboard field | Source |
|-----------------|--------|
| `financialSummary.totalOrdersAmount` | `Σ Order.totalPriceAfterDiscount` |
| `financialSummary.deliveryFees` | `Σ Order.shipping` |
| `financialSummary.adminCommission` | `Σ Order.adminCommission` |
| `orders[].invoiceTotal` | `Order.totalPriceAfterDiscount` |
| `orders[].deliveryPrice` | `Order.shipping` |

Order counts come from the assignment/order tables:

| Count | Definition |
|-------|------------|
| `acceptedOrders` | `OrderDeliveryAssignment` rows for the driver with `status = ACCEPTED`, `assignedAt` within the day. |
| `rejectedOrders` | `OrderDeliveryAssignment` rows with `status ∈ {REJECTED, TIMEOUT}` (see note below). |
| `deliveredOrders` | `Order` rows with `status = DELIVERED`, `date` within the day. |

> **Rejected = REJECTED + TIMEOUT.** Per the current product rule, a driver can no longer actively
> reject — they either accept or let the invitation lapse after 90s. Going forward the "not
> accepted" bucket is driven by `TIMEOUT`; `REJECTED` is retained in the filter only so historical
> (legacy) rows still show correctly. If "rejected" should ever mean *only* deliberate declines,
> remove `TIMEOUT` from the `status` filter — a one-line change in `getDriverDashboard`.

`totalOrdersAmount` sums **all** of the driver's orders for the day (not only delivered). To report
realized revenue only, narrow the financial `aggregate` where-clause to `status = DELIVERED`.

## Date handling

`?date` (or today, when omitted) is expanded to an inclusive **local-time** day window
`[00:00:00.000 .. 23:59:59.999]` and matched against `Order.date` / `OrderDeliveryAssignment.assignedAt`.
This mirrors the plain-`Date` convention already used by `getStatistics` — no new timezone
abstraction was introduced. The `selectedDate` label is built from **local** calendar parts (not
`toISOString`, which is UTC) so it always matches the day actually queried on servers ahead of UTC
(e.g. Egypt, UTC+2/+3).

## Field mapping reference

| Response field | Backed by |
|----------------|-----------|
| `avatar` | `User.image` (null-coalesced) |
| `isVerified` | `User.verified` |
| `isAvailable` | `DeliveryDetails.forceAvailable` — "متاح إجباري" toggle |
| `isOnShift` | `DeliveryDetails.availableNow` — "شغال النهاردة" toggle |

## Auth

Both new endpoints follow the **same posture as the sibling admin endpoints** (`getAll`,
`findOne`): no `@Auth` decorator. If they must be guarded, add
`@Auth({ prefix: 'delivery' })` to `list` and `dashboard` in the controller.

## Key code references

| Concern | Location |
|---------|----------|
| Endpoints (`GET /delivery`, `GET /delivery/:id/dashboard`) | `src/_modules/delivery/delivery.controller.ts` → `list()`, `dashboard()` |
| Listing + dashboard logic | `src/_modules/delivery/delivery.service.ts` → `findAllForDashboard()`, `getDriverDashboard()`, `dayRange()` |
| Card / orders selects, list where-clause | `src/_modules/delivery/prisma-args/delivery.prisma-args.ts` → `getDriverListWhere()`, `selectDriverCardOBJ()`, `selectDriverDashboardOrderOBJ()` |
| `?date` DTO | `src/_modules/delivery/dto/delivery.dto.ts` → `GetDriverDashboardDTO` |
| Response `pagination` field | `src/globals/services/response.service.ts` (`ResOptions`) |
| Tests | `src/_modules/delivery/__test__/delivery.dashboard.spec.ts` (8 unit tests, mocked Prisma) |

## Verification

- `npm run build` — passes.
- `npx jest src/_modules/delivery/__test__/delivery.dashboard.spec.ts` — 8/8 pass (no DB/Redis
  required; the service is constructed with a mocked `PrismaService`).
