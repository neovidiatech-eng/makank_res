# Order City & Zone Filters

## Overview

The orders list endpoint can filter orders by **delivery zone** and **delivery city**, in
addition to the existing filters (driver, customer, status, store/branch, module, type, search,
sort, pagination). Both new filters describe **where the order is delivered to** — the customer's
destination — not where the store is located.

City and zone form a hierarchy of the delivery destination:

```
City  ⊃  Zone  ⊃  exact delivery point
```

So an admin can filter by a whole city, then narrow to a single zone inside it, and the two stay
consistent because an order's city is derived **through** its zone.

## How an order gets a zone

Every order stores a `zoneId` that is resolved **once, at order-creation time** by testing the
delivery coordinates against each active zone's polygon (ray-casting point-in-polygon):

| Order type | Delivery coordinates used |
|------------|---------------------------|
| `DELIVERY` | The customer `Address` (`addressId` → `Address.lat/lng`) |
| `PICKUP` | None — no delivery destination, so `zoneId` stays `null` |
| `CUSTOM_DELIVERY` | The final stop (`Order.deliveryLat` / `deliveryLng`) |

Resolution is **fail-soft**: if the point matches no active zone, `zoneId` is `null` and order
creation proceeds normally. The value is frozen at creation, so later moving a store/branch never
changes a historical order's zone.

## Data model

```
City ──< Zone ──< Order
       (Zone.cityId)  (Order.zoneId)
```

| Field | Type | Notes |
|-------|------|-------|
| `Order.zoneId` | `Int?` (`order.zone_id`) | Delivery zone, resolved at creation. Indexed. |
| `Zone.cityId` | `Int?` (`zones.city_id`) | City the zone belongs to. Indexed. Assigned by admin when creating/editing the zone. |

An order's **delivery city** is `Order → Zone → cityId`. There is **no** `cityId` stored directly on
`Order` or `Address` — the zone is the single source of geographic truth, so city and zone can
never disagree.

> Note: `Store.cityId` still exists and is unchanged — it means "the city the merchant is registered
> in" and is used for store-level features. It is **not** what the orders city filter uses.

## API

### List orders

```
GET /api/orders?zoneId=1
GET /api/orders?cityId=1
GET /api/orders?cityId=1&zoneId=3
GET /api/orders?cityId=1&deliveryId=42&status=ON_THE_WAY      # combine with existing filters
GET /api/orders?type=CUSTOM_DELIVERY
```

Also applies to the archived list: `GET /api/orders/archived`.

**Auth:** access token required (`orders` permission). Store-role users are always scoped to their
own branch.

### New query parameters

| Param | Type | Description |
|-------|------|-------------|
| `cityId` | number | Return orders whose **delivery zone** belongs to this city (`Order.Zone.cityId`). |
| `zoneId` | number | Return orders whose delivery point falls inside this zone (`Order.zoneId`). |
| `type` | `OrderType` | `DELIVERY` / `PICKUP` / `CUSTOM_DELIVERY`. (Previously declared but inert — now active.) |

All three are optional. When none are supplied, behavior is unchanged. They compose with each other
and with every existing filter via `AND` (see `getOrderArgs` in
`src/_modules/order/prisma-args/order.prisma.args.ts`).

## Behavior notes

- **Out-of-zone orders.** An order whose delivery point matched no zone has `zoneId = null` and is
  therefore excluded by both the zone and the city filter. Keep active zones covering your full
  service area.
- **Zones need a city.** A zone with `cityId = null` is never returned by the city filter. Assign a
  city to each zone (zone create/update accepts `cityId`).
- **Custom delivery is covered.** Because zone is delivery-destination based, custom-delivery orders
  (which have no branch/store) are filterable by both city and zone — unlike `Store.cityId`, which
  could never reach them.
- **No backfill.** Orders created before this feature have `zoneId = null` and won't match the city
  or zone filter until re-created (or backfilled separately).

## Setup

1. Push the schema (adds `order.zone_id` and `zones.city_id`):
   ```
   npm run db:sync
   ```
2. Ensure zones exist with a `cityId` and a valid polygon (≥ 3 points). A minimal dev seed is
   provided:
   ```
   npx ts-node -r tsconfig-paths/register prisma/seeds/zone-city.seed.ts
   ```
   It creates 2 cities and 2 non-overlapping zones. Test points inside them:
   `lat 26.4307, lng 50.0988` (zone 1 / city 1) and `lat 26.4407, lng 50.1088` (zone 2 / city 2).

## Key code references

| Concern | Location |
|---------|----------|
| Zone resolution (point-in-polygon) | `src/_modules/zone/zone.service.ts` → `resolveZoneId()` |
| Polygon test helper | `src/globals/helpers/point-in-polygon.helper.ts` |
| Set `zoneId` on creation | `src/_modules/order/order.service.ts` → `create()`, `createCustomDeliveryOrder()` |
| Filter where-clause | `src/_modules/order/prisma-args/order.prisma.args.ts` → `getOrderArgs()` |
| Filter query params | `src/_modules/order/dto/order.dto.ts` → `FilterOrderDTO` |
| Schema | `prisma/schema/order.prisma`, `prisma/schema/zone.prisma`, `prisma/schema/city.prisma` |
