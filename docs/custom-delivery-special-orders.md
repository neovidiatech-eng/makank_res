# Custom Delivery (Special Delivery / Multi-Station Errands)

## Overview

A **custom delivery** (`OrderType.CUSTOM_DELIVERY`) lets a customer hire a driver to run a
multi-stop errand: visit one or more **stations** (a workshop, a grocery, a supermarket…), buy or
do something at each, then deliver everything to a final drop-off point. The driver works the
stations **strictly in order**, one active step at a time, and can only finish once every station
is reached.

This maps to the three driver-app tabs — **New**, **In Progress**, **History** — and a station
checklist UI ("Step 1 of 2", `Going to location` → `Reached`, `Move to next location`,
`Finish Task`).

A custom-delivery order has **no store/branch**. It carries an ordered list of stations, a
distance-based delivery price, an admin commission, and an estimated items cost the customer
either pre-pays (wallet) or pays the driver on delivery (cash).

Each station can also carry **0, 1, or many customer-uploaded images** (e.g. a photo of the exact
part to buy, a prescription, a reference picture). Images are **per-station** and apply **only** to
custom-delivery orders — see **[Station images](#station-images)**.

---

## Data model

Stations are **relational** (`order_stations`), not just JSON. The order keeps the first/last stop
coordinates for driver assignment and zone resolution; the full ordered list lives in `OrderStation`
rows (and a snapshot copy in `Order.invoice`).

```
Order ──< OrderStation ──< OrderStationImage
        (order_stations.order_id,   (order_station_images.station_id,
         ON DELETE CASCADE)          ON DELETE CASCADE)
```

`OrderStation` has an `Images OrderStationImage[]` relation. The `OrderStationImage` table and its
upload/attach flow are documented in **[Station images](#station-images)**.

### `OrderStation` (`order_stations`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `Int` PK | |
| `orderId` | `Int` (`order_id`) | FK → `order.id`, cascade delete. Indexed. |
| `sequence` | `Int` | 1-based position in the route. Order is significant. |
| `type` | `StationType` | `PICKUP` for every stop except the last; the final stop is `DROPOFF`. |
| `name` | `String?` | Store / workshop / station name. |
| `lat` / `lng` | `Float` | Station coordinates. |
| `purchaseList` | `String?` (`purchase_list`, TEXT) | What the driver should buy / do at this stop. |
| `estimatedCost` | `Float` (`estimated_cost`, default 0) | Estimated cost of items at this stop. |
| `notes` | `String?` (TEXT) | Per-station instructions for the driver. |
| `status` | `StationStatus` | `WAITING` → `GOING` → `REACHED`. Default `WAITING`. |
| `reachedAt` | `DateTime?` (`reached_at`) | Set when the station is reached. |

### Enums (`prisma/schema/enum.prisma`)

```prisma
enum StationStatus { WAITING  GOING  REACHED }
enum StationType   { PICKUP   DROPOFF }
```

### Custom-delivery fields on `Order` (`prisma/schema/order.prisma`)

| Field | Purpose |
|-------|---------|
| `pickupLat` / `pickupLng` | First stop — used by driver assignment (nearest-driver search). |
| `deliveryLat` / `deliveryLng` | Final stop — used to resolve `zoneId` and for live tracking. |
| `itemsDescription` | Full-order items description (distinct from per-station `purchaseList`). |
| `estimatedItemsCost` | **Summed** per-station estimated cost — the items amount actually charged. |
| `driverInstructions` | Full-order instructions (distinct from per-station `notes`). |
| `note` | Customer's general order note. |
| `zoneId` | Delivery zone, resolved from the final stop at creation. See `order-city-zone-filters.md`. |
| `deliveryId` | Assigned driver, set when a driver accepts. |

> Order-level `itemsDescription` / `driverInstructions` / `note` are **whole-order** fields. The
> per-station `name` / `purchaseList` / `estimatedCost` / `notes` live on each `OrderStation`.

---

## State machine

### Order status

```
READY_PICKUP ──(driver accepts)──> ON_THE_WAY ──(finish)──> DELIVERED
     │                                                          
     └── CANCELLED / REJECTED (as for any order)
```

A custom-delivery order is created directly as `READY_PICKUP` (no store prep step) and is
immediately offered to the nearest driver.

### Station status (strict sequential)

```
WAITING ──> GOING ──> REACHED
```

**Invariant:** while the order is `ON_THE_WAY`, **exactly one** station is `GOING` (the current
step); earlier stations are `REACHED`, later ones `WAITING`.

| Trigger | Effect |
|---------|--------|
| Driver **accepts** the order | Order → `ON_THE_WAY`; station `sequence=1` → `GOING`. |
| **Advance** ("Move to next location") | Current `GOING` station → `REACHED` (+`reachedAt`); next station → `GOING`. Rejected on the final station. |
| **Finish** ("Finish Task") | Requires every earlier station `REACHED`; runs the `DELIVERED` transition, then marks the final station `REACHED`. |

**Blocked transitions** (return `400`):
- Finishing while any earlier station is not `REACHED` — *"Cannot finish before completing all stations"*.
- Advancing the final station — *"Last station must be completed via finish"*.
- Advancing when no station is `GOING` — *"No active station to complete"*.
- Acting on an order that is not `ON_THE_WAY` — *"Order is not in progress"*.
- Acting as anyone other than the assigned driver — `403` *"Only the assigned driver can update this order"*.

### Progress block

Read endpoints attach a derived `customDeliveryProgress` to custom-delivery orders:

```json
{ "currentStep": 2, "totalSteps": 3, "finished": false }
```

`currentStep` is the sequence of the active (first non-`REACHED`) station; `finished` is `true` once
every station is `REACHED`. Computed by `buildStationProgress` — no extra column to keep in sync.

---

## Pricing

`calculateCustomDeliveryOrder` (in `order.service.ts`) composes the total:

```
itemsCost      = Σ station.estimatedCost           (falls back to order-level estimatedItemsCost
                                                     when stations carry no per-station cost)
shipping       = getCustomDeliveryPrice(stops)      (sum of stop-to-stop distance × shippingKMCharge
                                                     + deliveryCommission)   [HelpersService]
globalCommission = admin global commission on itemsCost      (see pricing-and-commission-analysis.md)
extraStopFee   = max(0, stops.length − 2) × customDeliveryExtraStopPrice    (Settings)
adminCommission = globalCommission + extraStopFee
total          = itemsCost + adminCommission + shipping + tip
```

- **No store commission, no tax** — there is no store involved.
- The estimated items cost **is charged** (included in `total`): paid from the wallet up-front, or
  collected by the driver on cash delivery.
- `customDeliveryExtraStopPrice`, `shippingKMCharge`, `deliveryCommission` are admin settings.

On the order: `price` = items cost, `estimatedItemsCost` = summed items cost, `shipping` = delivery
price, `adminCommission` = global + extra-stop fee, `storeCommission` = 0, `tax` = 0,
`totalPriceAfterDiscount` = `total`.

---

## Payment

Custom delivery uses the standard `PaymentMethod` enum — **no new provider**:

| Method | Meaning | Requirements |
|--------|---------|--------------|
| `CASH` | Pay the driver on delivery. | — |
| `WALLET` | Online / **Vodafone Cash** style manual transfer. | `transferNumber` (Egyptian phone `01[0125]XXXXXXXX`) **and** `transferImage` (receipt). |

- `WALLET` (or `paidWithWallet`) sets `paymentStatus = PAID` at creation; `CASH` stays `UNPAID`
  until `DELIVERED`.
- `paidWithWallet` additionally deducts the customer's in-app balance inside the creation
  transaction (balance is pre-checked first).

---

## Station images

A customer can attach **0, 1, or many images per station**. Images are **station-specific** — each
stop in the same order keeps its own independent list — and apply **only** to custom-delivery orders.
Normal orders are unaffected.

Because the stations don't exist yet while the customer is filling the form, images are uploaded in a
**separate request first**. The upload returns integer **image ids**; the customer embeds those ids
under each stop when creating the order. The client only ever sends ids the server issued — never a
file path or URL — so arbitrary-path injection and external URLs are impossible by construction.

### Data model — `OrderStationImage` (`order_station_images`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `Int` PK | The "image id" returned by the upload endpoint. |
| `userId` | `Int` (`user_id`) | Uploader / owner. Indexed. Enforces ownership at attach time. |
| `stationId` | `Int?` (`station_id`) | **Null until attached.** Set ("consumed") at order creation. FK → `order_stations.id`, cascade delete. Indexed. |
| `image` | `String` | Server-resolved file path (`uploads/orders/…`). Set by the server, never the client. |
| `createdAt` | `DateTime` (`created_at`) | Upload time — drives orphan cleanup. |

A row with `stationId = null` is an **uploaded-but-unattached** image owned by the uploader. Setting
`stationId` "consumes" it; consumed rows cascade-delete with their station/order.

### Flow at a glance

```
1. POST /api/orders/custom-delivery/images     (multipart, field `images`)  ──►  { imageIds: [12, 13] }
2. POST /api/orders/custom-delivery            (stops[i].imageIds = [12, 13])
        └─ in the create transaction: each stop's ids are validated + attached to its station by sequence
3. GET  /api/orders/:id                         (each station carries Images: [{ id, image }])
```

### 1. Upload images

```
POST /api/orders/custom-delivery/images
Auth: required (orders permission) · multipart/form-data · field name: images (one or more files)
```

| Rule | Value |
|------|-------|
| Field name | `images` (repeatable file field) |
| Max files / request | **10** |
| Max size / file | **5 MB** |
| Allowed types | `image/*` only (`image/jpeg`, `image/png`, `image/webp`, …); non-images rejected |

**Response**

```json
{ "message": "images uploaded successfully", "data": { "imageIds": [12, 13] } }
```

The returned ids belong to the authenticated user and stay **unused** until an order consumes them.
Call the endpoint as many times as needed (e.g. once per station) and collect the ids. The owner is
taken from the auth token — the request body carries only the files.

### 2. Attach on order creation

Put each station's ids in that stop's `imageIds` (see the [create body](#2-create-order)). At
creation, inside the order transaction, every referenced id is validated and attached to the matching
station **by `sequence`** (stop #1 → station `sequence` 1, …). Any violation rejects the **whole**
order — nothing is partially created.

The `400` messages below are **hardcoded Arabic literals** in the service (not locale-switched) — the
API returns the Arabic text regardless of `locale`; the English column is a gloss for readers.

| Rule | Returned message (ar) — English gloss |
|------|----------------------------------------|
| Each id must **exist**, belong to the **requesting user**, and be **unused** (`stationId` null) | `بعض الصور غير صالحة أو مستخدمة من قبل` — *Some images are invalid or already used* |
| An id is single-use — no duplicate ids within the request (cross-order/station reuse hits the rule above) | `لا يمكن استخدام نفس الصورة أكثر من مرة` — *Can't use the same image more than once* |
| **≤ 5** images per station (also enforced by the DTO `@ArrayMaxSize(5)`) | `لا يمكن إرفاق أكثر من 5 صور لكل محطة` — *Max 5 images per station* |
| **≤ 20** images per order, across all stations | `لا يمكن إرفاق أكثر من 20 صورة للطلب الواحد` — *Max 20 images per order* |

Ownership and single-use are enforced atomically: the attach is an `UPDATE … WHERE id IN (…) AND
user_id = <me> AND station_id IS NULL`. A foreign, missing, or already-consumed id simply isn't
matched, so the row count falls short and the order is rejected and rolled back.

### 3. Read images

Wherever stations are returned (customer order detail, driver current/pending assignment, order
lists), each station carries its images (id + path) in upload order:

```json
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

### Lifecycle & orphan cleanup

An uploaded image becomes a permanent file as soon as the upload responds. If the customer uploads
images but never creates the order — or a near-simultaneous duplicate create returns the idempotent
order without consuming them (see [Invariants](#invariants--edge-cases)) — those rows stay
`stationId = null`. A daily cron (`OrderCronService.cleanupOrphanStationImages`, **03:00**) deletes
unattached images older than **24 hours** (file **and** row). Attached images are never touched by the
cron; they live and die with their station/order via the cascade.

---

## Customer flow

### 1. Calculate price (preview)

```
POST /api/orders/custom-delivery/calculate
```

Body is `CalculateCustomDeliveryOrderDTO`; returns the price breakdown without creating anything.

### 2. Create order

```
POST /api/orders/custom-delivery
Auth: required (orders permission) · multipart (transferImage) · stops parsed from JSON
```

To attach images, upload them first via [`POST /custom-delivery/images`](#1-upload-images) and put the
returned ids in each stop's `imageIds`.

**Body** (`CreateCustomDeliveryOrderDTO`)

```json
{
  "stops": [
    { "lat": 24.71, "lng": 46.67, "name": "ورشة النور", "purchaseList": "مفك + مسامير", "estimatedCost": 50, "notes": "اطلب الكبير", "imageIds": [12, 13] },
    { "lat": 24.74, "lng": 46.69, "name": "سوبر ماركت", "purchaseList": "موز 2 كيلو", "estimatedCost": 30, "imageIds": [14] },
    { "lat": 24.75, "lng": 46.71, "name": "بيت العميل", "label": "الدار" }
  ],
  "itemsDescription": "أدوية عاجلة",
  "driverInstructions": "اتصل قبل الوصول",
  "note": "ملاحظات عامة",
  "tip": 10,
  "paymentMethod": "CASH"
}
```

> `stops` is sent as a JSON string in the multipart body (parsed server-side), so `imageIds` ride
> inside that JSON — they are **not** file uploads on this request. The files themselves were already
> uploaded in the separate [images](#1-upload-images) call.

| Field | Rules |
|-------|-------|
| `stops` | required — **≥ 2** stops (first = pickup, last = delivery). Each: `lat`/`lng` required; `name`, `label`, `purchaseList`, `notes` optional strings; `estimatedCost` optional, **non-negative**. |
| `stops[].imageIds` | optional — array of **≤ 5** integer image ids from [`/custom-delivery/images`](#1-upload-images); must be **your own, unused** ids. See [Station images](#2-attach-on-order-creation). |
| `paymentMethod` | required — `CASH` or `WALLET`. |
| `transferNumber`, `transferImage` | required **only when** `paymentMethod = WALLET`. |
| `tip`, `itemsDescription`, `driverInstructions`, `note`, `isGift`, `paidWithWallet` | optional. |

On create: stations are persisted (1-based, last = `DROPOFF`, all `WAITING`), any per-stop `imageIds`
are validated and attached to their station (see [Station images](#2-attach-on-order-creation)),
`zoneId` is resolved from the final stop, the price is computed, and the order (`READY_PICKUP`) is
offered to the nearest available driver via `handleOrderAssignment`. Creation is idempotent within a
20-second window for the same customer + pickup/delivery coords + total.

### 3. Track the order

Customers read their order through the normal `GET /api/orders` / `GET /api/orders/:id`. Custom
orders include the ordered `Stations` (each with its `Images` — see
[Read images](#3-read-images)) and the `customDeliveryProgress` block.

---

## Driver flow

The driver tabs reuse existing order filters plus the new `type` filter on pending assignments.

| Tab | Request |
|-----|---------|
| **New** (invitations) | `GET /api/delivery/me/pending-assignments?type=CUSTOM_DELIVERY` |
| **In Progress** | `GET /api/orders?type=CUSTOM_DELIVERY&current=true` (driver's own orders, auto-filtered) |
| **History** | `GET /api/orders?type=CUSTOM_DELIVERY&past=true` |
| **Active / current** | `GET /api/delivery/me/current-assignment` |

`current=true` → status not in `[DELIVERED, CANCELLED]`; `past=true` → status in
`[DELIVERED, CANCELLED]`. A driver's `deliveryId` filter is applied automatically; all driver
order/assignment responses carry `Stations` (each with its `Images`) + `customDeliveryProgress`, so
the driver sees the customer's reference photos per station.

### Accept / reject the invitation

```
PATCH /api/orders/:id/accept
PATCH /api/orders/:id/reject
```

Accept sets `deliveryId`, moves the order `READY_PICKUP → ON_THE_WAY`, and flips station 1 to
`GOING`. (Batch `PATCH /api/delivery/me/assignments/accept` routes through the same per-order
accept, so the station hook still runs.)

### Advance to the next station ("Move to next location")

```
PATCH /api/orders/custom-delivery/:id/advance
Body (optional): { "lat": 24.74, "lng": 46.69 }
```

Completes the active station, advances the next to `GOING`, optionally syncs the driver's live
position, notifies the customer, and returns the progress + station list. Rejected on the final
station (use finish).

### Finish the task ("Finish Task")

```
PATCH /api/orders/custom-delivery/:id/finish
Body (optional): { "lat": 24.75, "lng": 46.71 }
```

Valid only once every earlier station is `REACHED`. Runs the shared `DELIVERED` transition **first**
(location check, wallet distribution, transactions, best-seller, notifications, AFK break), **then**
marks the final station `REACHED`. Ordering matters: if the delivery transition fails (e.g. missing
`lat`/`lng`), nothing is mutated, so the order can never be left "all stations reached" yet not
delivered.

> The driver app should send `lat`/`lng` on finish — the `DELIVERED` transition rejects a delivery
> without coordinates for a driver.

### Route note

`advance` / `finish` use a **three-segment** path (`/custom-delivery/:id/...`) deliberately, so they
never collide with the generic `PATCH /orders/:id/:status` status-change route (`finish` is not an
`OrderStatus`).

---

## Permissions

All endpoints sit under the `orders` prefix; both the **Customer** and **Delivery** roles already
hold `orders: [post, get, patch]`. Customer-only vs driver-only behaviour is enforced in the
service layer:

- **Create / calculate** — any authenticated customer; `userId` is attached from the token.
- **Upload images** (`POST /custom-delivery/images`) — any authenticated customer; the owner is read
  from `@CurrentUser()` (the token), **not** the body. Ownership is then enforced when the ids are
  attached at order creation.
- **Advance / finish** — only the **assigned driver** (`role === DELIVERY && order.deliveryId ===
  user.id`); otherwise `403`.

---

## Notifications

Bilingual (`{ ar, en }`) push via `notificationService.sendLocalizedNotification`:

- **Advance** → the customer gets *"Station reached — the driver completed station N of M"*.
- **Finish** → the standard `DELIVERED` notifications fire (customer + relevant parties).
- **Accept invitation / reject** → existing assignment notifications (driver / admin).

---

## Invariants & edge cases

- Exactly one `GOING` station while `ON_THE_WAY`; strictly sequential — no skipping.
- Finish is all-or-nothing relative to delivery: the order becomes `DELIVERED` and is paid before
  the final station is marked reached.
- A terminal (`DELIVERED`) order cannot be re-finished — `getCustomDeliveryForProgress` requires
  `ON_THE_WAY`.
- Legacy custom orders with no `OrderStation` rows degrade gracefully (progress reports
  `currentStep: 0, totalSteps: 0, finished: true`); the station endpoints reject them
  (*"This order has no stations"*).
- **Station images** are single-use and owned: an id is attached to exactly one station of one order,
  and only by its uploader. Validation/attach is atomic — a bad id rolls back the whole order, never a
  partial attach.
- Images uploaded but never attached (abandoned order, or an idempotent duplicate create that returns
  the earlier order without consuming the retry's ids) stay `stationId = null` and are reaped by the
  daily orphan cron after 24h — no permanent files without a row, no rows without a station leak.
- Orders with no images, and legacy custom orders predating the feature, are unaffected — `imageIds`
  is optional and stations simply return `Images: []`.

---

## Key files

| File | Responsibility |
|------|----------------|
| `prisma/schema/order.prisma` | `OrderStation` + `OrderStationImage` models, `Order.Stations` relation, custom-delivery columns. |
| `prisma/schema/enum.prisma` | `StationStatus`, `StationType`. |
| `src/_modules/order/dto/custom-delivery-order.dto.ts` | `DeliveryStopDTO` (+`imageIds`), `Calculate/CreateCustomDeliveryOrderDTO`, `UploadStationImagesDTO`, `StationActionDTO`. |
| `src/_modules/order/order.service.ts` | create / calculate, accept hook, `advanceCustomDeliveryStation`, `finishCustomDelivery`, `buildStationProgress`, `attachCustomProgress`, `createStationImageUploads`, `consumeStationImages`. |
| `src/_modules/order/controllers/order.controller.ts` | `POST /custom-delivery(/calculate)`, `POST /custom-delivery/images`, `PATCH /custom-delivery/:id/advance`, `/finish`. |
| `src/_modules/order/cron/order-cron.service.ts` | `cleanupOrphanStationImages` — daily reap of unattached images. |
| `src/_modules/order/services/assignment.service.ts` | nearest-driver assignment using the pickup stop. |
| `src/_modules/order/services/helpers.service.ts` | `getCustomDeliveryPrice` (multi-stop distance pricing). |
| `src/_modules/order/prisma-args/order.prisma.args.ts` | `selectOrderOBJ` — exposes `Stations` (+ nested `Images`) + custom fields. |
| `src/decorators/api/upload-file.decorator.ts` | `UploadFiles` (now accepts a `fileType` mime filter, used by the image-upload endpoint). |
| `src/_modules/delivery/delivery.controller.ts` | `GET /me/pending-assignments?type=`, `/me/current-assignment`. |
| `src/_modules/order/__test__/custom-delivery.spec.ts` | DTO, pricing, station state-machine, and station-image tests. |

## Migration

Additive only — a new `order_stations` table plus the two enums (inlined into MySQL columns), and the
later `order_station_images` table (`station_id` FK → `order_stations`, cascade delete; indexed on
`user_id` and `station_id`). No changes to existing tables. Applied with `npm run db:sync`
(`prisma db push`).
