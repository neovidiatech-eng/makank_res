# Checkout, Commission, Shipping, and Payment Integration Guide

Audience: customer mobile app, driver app, admin dashboard, and store-owner dashboard teams.

Last reviewed against code and `swagger-spec.json`: 2026-06-14.

This guide documents how frontend and mobile clients should integrate everything around checkout:
service prices, store commission, global commission, shipping, tax/service fee, coupons, fortune
rewards, payments, wallets, custom delivery, order tracking, and admin configuration.

Related deeper docs:

- `docs/pricing-integration-guide-frontend-mobile.md`
- `docs/pricing-and-commission-analysis.md`
- `docs/coupons.md`
- `docs/custom-delivery-special-orders.md`
- `docs/fortune-wheel.documentation.md`
- `docs/is-gift-order.md`

## 1. Base API conventions

Base prefix: every route below is under `/api`.

Local Swagger UI: `http://localhost:3030/api/docs`.

Default response envelope:

```json
{
  "message": "translated message",
  "data": {},
  "total": 10
}
```

Important request headers:

| Header | Use |
| --- | --- |
| `Authorization: Bearer <accessToken>` | Required for authenticated routes. |
| `locale: ar` or `locale: en` | Controls translated response messages and localized JSON fields when requested. |
| `isLocalized: true` | When supported by `ResponseService`, bilingual JSON fields can be reduced to the active locale. |

File upload endpoints use `multipart/form-data`. Normal JSON endpoints use `application/json`.

## 2. Golden rules for clients

1. Never calculate the final payable total on the client. Use `POST /api/orders/calculate/order`
   or `POST /api/orders/custom-delivery/calculate`.
2. Never send item prices, totals, commission amounts, tax, or shipping in create-order requests.
   Send IDs and selections only.
3. Treat store list `deliveryPrice` as an estimate only. Checkout `shipping` is authoritative.
4. All service and size prices returned by service APIs are already customer-facing and
   store-commission-inclusive. Do not add commission client-side.
5. Add-ons are raw additions and do not receive store commission.
6. `shipping` includes delivery fee plus tip. There is no separate tip line in the main calculate
   response.
7. `discountValue` in calculate responses, and `discountAmount` in order read responses, are combined
   discount amounts. They can include coupon discount plus fortune reward discount.
8. The API field is still named `tax`. Do not rename the contract to `serviceFee` unless the backend
   changes.
9. For `DELIVERY`, select an address before calculating. For `PICKUP`, explicitly send
   `"type": "PICKUP"` so shipping is zero and no address is required.
10. Recalculate whenever the cart, address, coupon, reward, order type, branch, or tip changes.

## 3. Regular checkout flow

This is the customer app flow for restaurant/grocery/pharmacy style store orders.

### Step 1 - Discover stores and branches

Use store listing to show nearby stores:

```http
GET /api/stores?lat=30.0444&lng=31.2357&moduleId=1
GET /api/stores/:id
GET /api/stores/:id/products
```

Useful store response fields:

| Field | Meaning |
| --- | --- |
| `id` | Store ID. |
| `branchId` | The branch to use when placing the order. Send this as `branchId` to checkout. |
| `lat`, `lng` | Selected or nearest branch coordinates. |
| `distance` | Distance estimate from the supplied coordinates to the branch. |
| `deliveryTime` | Estimated travel duration when map details are available. |
| `deliveryPrice` | Browse-time delivery estimate. Do not use as final checkout shipping. |
| `commission`, `commissionType` | Store commission config, informational for dashboards. |
| `Coupon` | A store/global coupon preview, not guaranteed to apply to the current cart/address. |

Client note: `deliveryPrice` on store listing may be based on a simplified estimate and can differ
from checkout because checkout uses the saved address, branch, free-delivery threshold, admin
shipping settings, tip, and rewards.

### Step 2 - Load services and build the cart

Use either:

```http
GET /api/stores/:id/products
GET /api/services?storeId=:storeId
GET /api/services/:id
```

Cart item shape for calculate/create:

```json
{
  "serviceId": 47,
  "sizeId": 12,
  "addonIds": [5, 6],
  "quantity": 2
}
```

Rules:

- `serviceId` and `quantity` are required.
- `sizeId` is optional. If selected, that size price replaces the base service price.
- `addonIds` is optional. Add-ons are additive.
- All items should belong to the same branch/store context represented by `branchId`.
- Do not send `price`, `unitPrice`, `shipping`, `tax`, `commission`, or `total`.

### Step 3 - Select address or pickup

Address endpoints:

```http
GET /api/addresses
POST /api/addresses
PATCH /api/addresses/:id
DELETE /api/addresses/:id
```

Address create body:

```json
{
  "title": "Home",
  "address": "Street, building, floor",
  "lat": 30.0444,
  "lng": 31.2357
}
```

For `DELIVERY`, pass `addressId` to calculate and create.

For `PICKUP`, pass:

```json
{
  "type": "PICKUP"
}
```

Pickup orders get `shipping = 0` and no delivery assignment.

### Step 4 - Calculate checkout

Endpoint:

```http
POST /api/orders/calculate/order
Authorization: Bearer <customer token>
Content-Type: application/json
```

Delivery body:

```json
{
  "branchId": 47,
  "type": "DELIVERY",
  "addressId": 10,
  "items": [
    { "serviceId": 101, "sizeId": 7, "addonIds": [3], "quantity": 2 }
  ],
  "couponCode": "SAVE20",
  "fortuneRewardId": 15,
  "tip": 10
}
```

Pickup body:

```json
{
  "branchId": 47,
  "type": "PICKUP",
  "items": [
    { "serviceId": 101, "quantity": 1 }
  ],
  "couponCode": "SAVE20"
}
```

Calculate response fields:

```json
{
  "price": 1100,
  "subtotal": 1100,
  "totalPrice": 1172,
  "priceAfterDiscount": 1100,
  "priceAfterTax": 1100,
  "discountValue": 0,
  "globalCommission": 22,
  "storeCommission": 100,
  "adminCommission": 122,
  "commission": 122,
  "tax": 0,
  "shipping": 50,
  "couponId": null,
  "rewardId": null,
  "zoneId": 1,
  "items": []
}
```

Display guidance:

| Calculate field | UI meaning |
| --- | --- |
| `subtotal` or `price` | Items subtotal. Store commission is already inside. Global commission is not inside. |
| `shipping` | Final shipping line for this checkout. Includes tip. |
| `tax` | Tax/service-fee line. Contract name is still `tax`. |
| `globalCommission` | Platform fee added on top of subtotal. This is the customer-visible fee if product wants to show one. |
| `storeCommission` | Store markup baked into item prices. Usually hide from customers. |
| `adminCommission` / `commission` | Platform/admin revenue = `globalCommission + storeCommission`. Usually internal. |
| `discountValue` | Combined coupon plus fortune reward discount. |
| `totalPrice` | Final payable total for the preview. |
| `zoneId` | Resolved delivery zone for coupon validation. Null for pickup/out-of-zone. |

Recommended receipt preview:

```text
Items subtotal        subtotal
Delivery              shipping
Tax / service fee     tax
Platform fee          globalCommission
Discount             -discountValue
Total                 totalPrice
```

### Step 5 - Create the order

Endpoint:

```http
POST /api/orders
Authorization: Bearer <customer token>
Content-Type: multipart/form-data
```

Use the same cart fields as calculate, plus payment fields:

```json
{
  "branchId": 47,
  "type": "DELIVERY",
  "addressId": 10,
  "items": [
    { "serviceId": 101, "sizeId": 7, "addonIds": [3], "quantity": 2 }
  ],
  "couponCode": "SAVE20",
  "fortuneRewardId": 15,
  "tip": 10,
  "note": "No onions",
  "paymentMethod": "CASH",
  "paidWithWallet": false,
  "isGift": false,
  "category": "IMMEDIATE"
}
```

Multipart notes:

- `items` should be sent as a JSON string when using `multipart/form-data`.
- `transferImage` is a file field used for manual transfer payments.
- For simple cash orders, many clients can still send multipart without a file. This matches Swagger.

Order create returns the created order under `data.data` in the current controller pattern:

```json
{
  "message": "order created successfully",
  "data": {
    "data": {
      "id": 123,
      "price": 1100,
      "totalPriceAfterDiscount": 1172,
      "discountAmount": 0,
      "adminCommission": 122,
      "globalCommission": 22,
      "storeCommission": 100,
      "shipping": 50,
      "tax": 0,
      "paymentStatus": "UNPAID",
      "paymentMethod": "CASH",
      "status": "PREPARING"
    }
  }
}
```

Creation behavior:

- Pricing is recalculated server-side. The preview total is not trusted.
- Coupon usage is revalidated and incremented atomically.
- Fortune reward is consumed atomically.
- If `paidWithWallet` is true, wallet balance is checked before the transaction and deducted inside
  the transaction.
- Duplicate prevention returns a recent matching order if the same user submits the same order within
  roughly 20 seconds.
- `category: "SCHEDULED"` creates an archived/scheduled order instead of an immediate live order.

### Step 6 - Read, track, and update after creation

Customer/admin/store order reads:

```http
GET /api/orders
GET /api/orders/:id
GET /api/orders?current=true
GET /api/orders?past=true
GET /api/orders?type=DELIVERY
GET /api/orders?cityId=1&zoneId=3
GET /api/orders/:id/tracking
```

Order read financial fields:

| Field | Meaning |
| --- | --- |
| `price` | Persisted items subtotal. |
| `totalPriceAfterDiscount` | Persisted final payable total. Use this for order history and receipts. |
| `discountAmount` | Persisted combined discount. |
| `shipping` | Persisted delivery fee plus tip. |
| `tax` | Persisted tax/service fee. |
| `globalCommission` | Persisted platform fee. |
| `storeCommission` | Persisted store markup amount. |
| `adminCommission` | Persisted admin/platform revenue. |
| `invoice.summary` | Snapshot used for receipt display. |

Tracking endpoint:

```http
GET /api/orders/:id/tracking
```

Response when assigned:

```json
{
  "order_id": 123,
  "delivery_boy": {
    "id": 44,
    "lat": 30.0444,
    "lng": 31.2357,
    "bearing": 90,
    "last_seen": "2026-06-14T10:00:00.000Z"
  }
}
```

## 4. Service price and commission model

There are two independent commission concepts.

### 4.1 Store commission

Store commission lives on the store:

```prisma
Store.commission
Store.commissionType // PERCENTAGE or FIXED
```

It is applied to service or selected-size base price, per unit. It is already baked into the
customer-facing prices returned by service APIs.

Formula:

```text
if commissionType = PERCENTAGE:
  customerBasePrice = rawBasePrice + (rawBasePrice * commission / 100)

if commissionType = FIXED:
  customerBasePrice = rawBasePrice + commission
```

Important:

- Store commission applies to the base service price or selected size price.
- Store commission does not apply to add-ons.
- Store commission is counted per quantity.
- Clients should not add or remove it.

### 4.2 Global commission

Global commission is configured in settings:

| Setting key | Meaning |
| --- | --- |
| `businessOrderCommissionRateForAll` | Enables/disables global commission. |
| `businessOrderCommissionRate` | Commission value. |
| `businessOrderCommissionType` | `PERCENTAGE` or `FIXED`. |

It is applied once per order on the items subtotal, excluding delivery/shipping.

Formula:

```text
if disabled:
  globalCommission = 0

if type = PERCENTAGE:
  globalCommission = subtotal * value / 100

if type = FIXED:
  globalCommission = value
```

Global commission is added on top of the final customer total.

### 4.3 Admin commission

Persisted `adminCommission` is:

```text
adminCommission = globalCommission + storeCommission
```

This is important for wallet split and admin/store dashboard reporting. It is usually not a
customer-facing line.

### 4.4 Service response fields

Service responses expose commission-inclusive prices:

```json
{
  "id": 101,
  "price": 165,
  "priceAfterDiscount": 132,
  "effectivePrice": 132,
  "hasDiscount": true,
  "priceWithDefaultOptions": 132,
  "commission": 10,
  "commissionType": "PERCENTAGE",
  "Sizes": [
    {
      "id": 7,
      "price": 165,
      "priceAfterDiscount": 132,
      "effectivePrice": 132,
      "hasDiscount": true,
      "isDefault": true
    }
  ],
  "Addons": [
    { "id": 3, "price": 10 }
  ]
}
```

Use these fields as follows:

| UI context | Field |
| --- | --- |
| Store/product list card | `priceWithDefaultOptions` |
| Product detail base price | `effectivePrice` |
| Size selector | `size.effectivePrice` |
| Strikethrough original price | `price` when `hasDiscount = true` |
| Add-on row | `addon.price` |
| Cart display estimate | selected effective price plus selected add-ons, times quantity |
| Final checkout total | calculate response `totalPrice` |
| Order history total | order response `totalPriceAfterDiscount` |

Discounted service prices are absolute sale prices, not percentages. The backend validates that
`priceAfterDiscount` is lower than `price`.

## 5. Regular order calculation formula

For normal store orders, the backend does this:

```text
for each item:
  rawBase = selectedSize.price if sizeId exists else service.price
  effectiveRawBase = priceAfterDiscount when valid else rawBase
  storeCommissionPerUnit = commission on effectiveRawBase
  clientBase = effectiveRawBase + storeCommissionPerUnit
  unitPrice = clientBase + sum(addon.price)
  lineTotal = unitPrice * quantity

subtotal = sum(lineTotal)
tax = tax based on subtotal
shippingBeforeReward = 0 for PICKUP else deliveryFee(address, branch, subtotal) + tip
couponDiscount = coupon discount on subtotal
globalCommission = global commission on subtotal
rewardDiscount/freeDelivery = fortune reward effect after coupon validation
discountedSubtotal = max(0, subtotal - couponDiscount - rewardDiscount)
shipping = shippingBeforeReward, or tip only when free-delivery reward applies
totalPrice = discountedSubtotal + tax + shipping + globalCommission
adminCommission = globalCommission + totalStoreCommission
```

Verification formula:

```text
calculate.totalPrice =
  max(0, calculate.subtotal - calculate.discountValue)
  + calculate.tax
  + calculate.shipping
  + calculate.globalCommission
```

Do not use this formula as a replacement for server calculation. It is only useful for UI sanity
checks and QA.

## 6. Shipping and delivery fee

### 6.1 Regular delivery shipping

The authoritative regular-delivery fee is calculated during order calculation:

```text
shipping = (distanceKm * shippingKMCharge) + deliveryCommission + tip
```

Where:

- Distance is from the selected saved `Address` to the selected `Branch`.
- Google/map details are used when available.
- The fallback distance helper is used when map details fail.
- `shippingKMCharge` comes from settings.
- `deliveryCommission` comes from settings.
- `tip` is added after delivery fee.

Settings involved:

| Setting key | Meaning |
| --- | --- |
| `shippingKMCharge` | Price per kilometer. |
| `deliveryCommission` | Fixed amount added to delivery fee. |
| `businessFreeDeliveryOver` | Optional setting read by code. If present and subtotal is high enough, base delivery becomes zero. |

Client behavior:

- Show store list `deliveryPrice` only as an estimate.
- Recalculate after address changes.
- Recalculate after tip changes.
- Show `shipping` from calculate/order response in checkout and receipts.

### 6.2 Pickup shipping

If `type = PICKUP`:

```text
shipping = 0
addressId is not required
no driver assignment is created
```

### 6.3 Free-delivery rewards

When a fortune reward of type `FREE_DELIVERY` applies:

```text
shipping = tip
```

The base delivery fee is zeroed, but the tip remains. A pickup order cannot use a free-delivery
reward because it has no delivery fee.

### 6.4 Custom delivery shipping

Custom delivery uses ordered stops, not address/branch:

```text
shipping = (sum distance between consecutive stops * shippingKMCharge) + deliveryCommission
total = itemsCost + globalCommission + extraStopFee + shipping + tip
```

See the custom delivery section for the complete formula.

## 7. Coupons and fortune rewards at checkout

### 7.1 Coupons

Customer coupon list:

```http
GET /api/users/me/coupon
```

This list is display-only. A listed coupon may still fail at checkout because checkout validates
store, user, dates, usage count, min order amount, and delivery zone.

Apply a coupon by sending `couponCode` on both calculate and create:

```json
{
  "couponCode": "SAVE20"
}
```

Coupon discount is applied to the items subtotal. It excludes tax, delivery, and global commission.

Zone behavior:

- `DELIVERY`: zone is resolved from the selected address coordinates.
- `PICKUP`: zone is null.
- Zone-restricted coupons require a matching non-null zone.
- Global coupons work without a zone.

Client flow:

1. Let the user enter/select a coupon.
2. Require address first for delivery orders.
3. Call calculate with `couponCode`.
4. If address changes, recalculate.
5. Send the same `couponCode` again on create.
6. If create returns `409 Coupon is no longer available`, recalculate without it or ask the user to
   choose another coupon.

Common coupon errors:

| Message | Suggested handling |
| --- | --- |
| `Coupon not found` | Invalid code. |
| `Coupon is not active` | Coupon unavailable. |
| `Coupon has not started yet` | Coupon not available yet. |
| `Coupon has expired` | Expired coupon. |
| `Coupon usage limit has been reached` | Fully redeemed. |
| `Coupon cannot be used with this order amount because of minOrderAmount` | Show min-order hint. |
| `Coupon is not valid for this user` | Not eligible for this account/store. |
| `Coupon is not valid for this delivery zone` | Ask for address first, or show unavailable in this area. |
| `Coupon is no longer available` | Race at create time; refresh checkout. |

### 7.2 Fortune rewards

A reward from Fortune Wheel is redeemed by sending `fortuneRewardId` on calculate and create:

```json
{
  "fortuneRewardId": 15
}
```

Supported checkout effects:

| Reward type | Checkout behavior |
| --- | --- |
| `DISCOUNT` | Percent discount on post-coupon subtotal, capped by reward max. |
| `FIXED_AMOUNT` | Fixed amount off subtotal. |
| `FREE_DELIVERY` | Removes delivery fee but keeps tip. Not valid for pickup. |
| `CUSTOM` | Not redeemable at checkout. |
| `NONE` | No reward is persisted. |

The reward must belong to the user, be valid, unexpired, and within its min/max order amount rules.
It is consumed atomically when the order is created.

## 8. Payment and wallets

### 8.1 Payment enums

Current `PaymentMethod` enum:

```text
CASH
WALLET
```

Current `PaymentStatus` enum:

```text
PAID
UNPAID
FAILED
```

### 8.2 Cash payment

Create body:

```json
{
  "paymentMethod": "CASH",
  "paidWithWallet": false
}
```

Behavior:

- Order is created with `paymentStatus = UNPAID`.
- When the order becomes `DELIVERED`, `paymentStatus` is set to `PAID`.
- Driver wallet treats this as cash collected from the customer.

### 8.3 Manual transfer / wallet-labelled payment

The current backend uses `paymentMethod = WALLET` for a manual-transfer style flow.

Required fields:

```json
{
  "paymentMethod": "WALLET",
  "transferNumber": "01012345678",
  "transferImage": "<file>"
}
```

Rules:

- `transferNumber` must match an Egyptian mobile pattern: `01[0125]XXXXXXXX`.
- `transferImage` is required.
- Order is considered `PAID` at creation.

The name is potentially confusing: `PaymentMethod.WALLET` here is not the same as blindly deducting
the user's in-app wallet balance. The in-app balance path is controlled by `paidWithWallet`.

### 8.4 In-app wallet balance

Customer wallet endpoint:

```http
GET /api/users/me/wallet
```

Driver wallet endpoint:

```http
GET /api/delivery/me/wallet
```

Store wallet endpoint:

```http
GET /api/stores/me/wallet
```

If `paidWithWallet = true`:

- Backend checks the customer wallet balance before creating the order.
- Backend deducts `totalPrice` inside the order transaction.
- Insufficient balance returns `400 Insufficient balance`.

Recommended client rule:

- Use `paidWithWallet` only when the customer explicitly pays using their in-app wallet balance.
- Recalculate immediately before create so the wallet-balance check uses the latest total.

### 8.5 Hosted/payment-provider endpoints

There are hosted payment routes:

```http
POST /api/kashier/create-payment
GET /api/kashier/callback
POST /api/kashier/webhook
POST /api/orders/:id/payment
```

Important integration caveat:

- The order `PaymentMethod` enum currently has only `CASH` and `WALLET`.
- The Kashier success handler can mark an order `PAID`, but the order's `paymentMethod` remains
  whatever it was created with.
- Wallet distribution later uses `paymentMethod === CASH` to decide whether the driver collected
  cash.

Do not enable hosted online payment in production clients until the backend payment-method contract
is confirmed or extended with a non-cash online method. Otherwise driver/store wallet accounting can
be wrong for online-paid orders created as `CASH`.

## 9. Custom delivery checkout

Custom delivery is `OrderType.CUSTOM_DELIVERY`: multi-stop errands with no store/branch.

### 9.1 Customer price preview

Endpoint:

```http
POST /api/orders/custom-delivery/calculate
Content-Type: application/json
```

Current controller does not require auth for calculate, but create requires auth.

Body:

```json
{
  "stops": [
    {
      "lat": 30.0444,
      "lng": 31.2357,
      "name": "Pickup place",
      "purchaseList": "2 kg apples",
      "estimatedCost": 100,
      "notes": "Call before buying"
    },
    {
      "lat": 30.0555,
      "lng": 31.2444,
      "name": "Dropoff"
    }
  ],
  "itemsDescription": "Groceries",
  "estimatedItemsCost": 100,
  "driverInstructions": "Please call on arrival",
  "tip": 10
}
```

Rules:

- `stops` is required.
- Minimum two stops: first is pickup, last is final delivery/dropoff.
- Each stop requires `lat` and `lng`.
- `estimatedCost` per stop is optional.
- If any stop has `estimatedCost`, item cost is the sum of stop estimates.
- If no stop has `estimatedCost`, item cost falls back to top-level `estimatedItemsCost`.

Response:

```json
{
  "stops": [],
  "estimatedItemsCost": 100,
  "globalCommission": 2,
  "extraStopFee": 0,
  "adminCommission": 2,
  "shipping": 35,
  "total": 147
}
```

Formula:

```text
itemsCost = sum(stops[].estimatedCost) or estimatedItemsCost
shipping = total stop-to-stop distance * shippingKMCharge + deliveryCommission
globalCommission = global commission on itemsCost
extraStopFee = max(0, stops.length - 2) * customDeliveryExtraStopPrice
adminCommission = globalCommission + extraStopFee
total = itemsCost + adminCommission + shipping + tip
```

No store commission and no tax apply to custom delivery.

### 9.2 Upload station images

If the customer attaches station images, upload first:

```http
POST /api/orders/custom-delivery/images
Authorization: Bearer <customer token>
Content-Type: multipart/form-data
```

Field name: `images`.

Response:

```json
{
  "message": "images uploaded successfully",
  "data": { "imageIds": [12, 13] }
}
```

Attach IDs under each stop on create:

```json
{
  "stops": [
    { "lat": 30.0444, "lng": 31.2357, "imageIds": [12, 13] },
    { "lat": 30.0555, "lng": 31.2444 }
  ]
}
```

Limits:

- Max 10 files per upload request.
- Max 5 MB per file.
- Images only.
- Max 5 image IDs per station.
- Max 20 image IDs per order.
- IDs are single-use and owned by the uploading user.

### 9.3 Create custom delivery order

Endpoint:

```http
POST /api/orders/custom-delivery
Authorization: Bearer <customer token>
Content-Type: multipart/form-data
```

Send `stops` as a JSON string in multipart.

Body:

```json
{
  "stops": [
    {
      "lat": 30.0444,
      "lng": 31.2357,
      "name": "Market",
      "purchaseList": "2 kg apples",
      "estimatedCost": 100,
      "imageIds": [12]
    },
    {
      "lat": 30.0555,
      "lng": 31.2444,
      "name": "Home"
    }
  ],
  "itemsDescription": "Groceries",
  "driverInstructions": "Call before arrival",
  "tip": 10,
  "paymentMethod": "CASH",
  "paidWithWallet": false,
  "isGift": false,
  "note": "Handle carefully"
}
```

If `paymentMethod = WALLET`, include `transferNumber` and `transferImage`.

Create behavior:

- Persists an order with `type = CUSTOM_DELIVERY`.
- First stop becomes pickup coordinates.
- Last stop becomes delivery coordinates and resolves `zoneId`.
- Order starts as `READY_PICKUP`.
- Nearest-driver assignment is triggered immediately when assignment mode is `AUTO`.
- Stations are created in order.
- Station images are attached atomically.

### 9.4 Custom delivery driver flow

Driver endpoints:

```http
GET /api/delivery/me/pending-assignments?type=CUSTOM_DELIVERY
GET /api/delivery/me/current-assignment
PATCH /api/orders/:id/accept
PATCH /api/orders/:id/reject
PATCH /api/delivery/me/assignments/accept
PATCH /api/orders/custom-delivery/:id/advance
PATCH /api/orders/custom-delivery/:id/finish
```

When the driver accepts:

- `deliveryId` is set.
- Order moves from `READY_PICKUP` to `ON_THE_WAY`.
- First station moves from `WAITING` to `GOING`.

Advance endpoint:

```http
PATCH /api/orders/custom-delivery/:id/advance
```

Body:

```json
{ "lat": 30.0500, "lng": 31.2400 }
```

Finish endpoint:

```http
PATCH /api/orders/custom-delivery/:id/finish
```

Body:

```json
{ "lat": 30.0555, "lng": 31.2444 }
```

Driver app must send `lat` and `lng` on finish. The shared delivered-status path requires location
coordinates for delivery users.

Station statuses:

```text
WAITING -> GOING -> REACHED
```

Custom delivery order responses include:

```json
{
  "customDeliveryProgress": {
    "currentStep": 2,
    "totalSteps": 3,
    "finished": false
  },
  "Stations": [
    {
      "sequence": 1,
      "status": "REACHED",
      "Images": [{ "id": 12, "image": "uploads/orders/file.jpg" }]
    }
  ]
}
```

## 10. Order statuses and assignment

Order statuses:

```text
PENDING
PREPARING
READY_PICKUP
ON_THE_WAY
DELIVERED
CANCELLED
REJECTED
PAYMENT_FAILD
PENDING_PAYMENT
```

Normal store order default status after create is `PREPARING`.

Custom delivery default status after create is `READY_PICKUP`.

Driver assignment:

- Auto assignment is controlled by `deliveryAssignmentMode`.
- Drivers are offered assignments through `OrderDeliveryAssignment`.
- `deliveryAcceptanceTimer` controls how long a pending assignment stays valid.
- Drivers can accept per order or batch accept all pending assignments.
- Pickup orders are not assigned to drivers.
- Custom delivery assignment uses the first stop as pickup location.
- Regular delivery assignment uses branch location as pickup location.

Status update endpoint:

```http
PATCH /api/orders/:id/:status
```

Driver location rules:

- Driver setting `ON_THE_WAY` must send `lat`/`lng` and be near the store/branch.
- Driver setting `DELIVERED` must send `lat`/`lng` and be near the customer address when the order
  has an address.
- Custom delivery `finish` calls the same delivered path first.

## 11. Wallet and earnings split

Wallet split happens when an order becomes `DELIVERED`.

Persisted fields used:

```text
total = order.totalPriceAfterDiscount
adminCommission = order.adminCommission
shipping = order.shipping
branchEarning = total - adminCommission - shipping
```

Distribution:

| Party | Receives / tracks |
| --- | --- |
| Admin | `adminCommission` |
| Store branch | `totalPriceAfterDiscount - adminCommission - shipping` |
| Driver | `shipping` for online/manual-paid orders; for cash, driver collected cash is tracked too |

Client implications:

- Store/admin dashboards must display persisted order values, not recomputed values.
- Driver dashboard delivery fee should use persisted `shipping`.
- If showing store revenue, do not use customer total directly; subtract admin commission and shipping.
- For cash orders, driver cash collection affects driver wallet balance.

Cancellation/refund:

- If a paid order is cancelled, the backend refunds the customer wallet and deducts branch/admin
  wallet values in the refund path.

## 12. Admin dashboard configuration

### 12.1 Store commission

Endpoint:

```http
PATCH /api/stores/:id/commission
Authorization: Bearer <admin token>
Content-Type: application/json
```

Body:

```json
{
  "commission": 10,
  "commissionType": "PERCENTAGE"
}
```

Rules:

- `commission` must be >= 0.
- `commissionType` is `PERCENTAGE` or `FIXED`.
- Percentage commission cannot exceed 100.
- Fixed commission has no upper cap in the service.

After update:

- Service and size prices returned by service APIs change because store commission is baked into
  customer-facing prices.
- Existing orders keep persisted values.
- New calculate/create calls use the new commission.

### 12.2 Global commission

Endpoint:

```http
PATCH /api/settings
Authorization: Bearer <admin token>
Content-Type: multipart/form-data
```

The controller expects a `settings` array. In multipart, send it as a JSON string.

Example:

```json
{
  "settings": [
    {
      "setting": "businessOrderCommissionRateForAll",
      "value": "true",
      "name": { "ar": "Global commission enabled", "en": "Global commission enabled" }
    },
    {
      "setting": "businessOrderCommissionRate",
      "value": "2",
      "name": { "ar": "Global commission rate", "en": "Global commission rate" }
    },
    {
      "setting": "businessOrderCommissionType",
      "value": "PERCENTAGE",
      "name": { "ar": "Global commission type", "en": "Global commission type" }
    }
  ]
}
```

Client note: the existing dashboard settings editor should preserve/display the setting `name` value.
If you are building a narrow commission form, fetch current settings first and submit the required
setting objects in the format above.

### 12.3 Shipping settings

Relevant settings:

| Setting key | UI label suggestion |
| --- | --- |
| `shippingKMCharge` | Delivery price per km |
| `deliveryCommission` | Fixed delivery fee |
| `customDeliveryExtraStopPrice` | Extra stop fee for custom delivery |
| `businessFreeDeliveryOver` | Free delivery threshold, when present |

Same `PATCH /api/settings` format as above.

### 12.4 Tax/service-fee settings

Relevant settings:

| Setting key | Meaning |
| --- | --- |
| `StoreTaxForAll` | If true, use global setting tax rate. |
| `StoreTaxRate` | Global tax rate percent. |
| `Store.tax` | Store tax percent when global tax is disabled. |

Contract caveat: order responses still use the field name `tax`.

## 13. Suggested TypeScript models

These are client-side examples, not generated SDK code.

```ts
type CommissionType = 'PERCENTAGE' | 'FIXED';
type PaymentMethod = 'CASH' | 'WALLET';
type PaymentStatus = 'PAID' | 'UNPAID' | 'FAILED';
type OrderType = 'DELIVERY' | 'PICKUP' | 'CUSTOM_DELIVERY';
type OrderCategory = 'IMMEDIATE' | 'SCHEDULED';

type CartItemInput = {
  serviceId: number;
  sizeId?: number;
  addonIds?: number[];
  quantity: number;
};

type CalculateOrderRequest = {
  couponCode?: string;
  items: CartItemInput[];
  addressId?: number;
  branchId: number;
  tip?: number;
  type?: OrderType;
  fortuneRewardId?: number;
};

type CalculateOrderResponse = {
  price: number;
  subtotal: number;
  totalPrice: number;
  priceAfterDiscount: number;
  priceAfterTax: number;
  discountValue: number;
  globalCommission: number;
  storeCommission: number;
  adminCommission: number;
  commission: number;
  tax: number;
  shipping: number;
  couponId?: number | null;
  rewardId?: number | null;
  zoneId?: number | null;
};

type CreateOrderRequest = CalculateOrderRequest & {
  note?: string;
  paymentMethod: PaymentMethod;
  paidWithWallet?: boolean;
  isGift?: boolean;
  category?: OrderCategory;
  scheduledAt?: string;
  transferNumber?: string;
  transferImage?: File;
};

type OrderFinancials = {
  price: number;
  totalPriceAfterDiscount: number;
  discountAmount: number;
  adminCommission: number;
  globalCommission: number;
  storeCommission: number;
  shipping: number;
  tax: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
};
```

## 14. Error handling checklist

Handle these as first-class checkout states:

| Situation | Typical error/message | Client action |
| --- | --- | --- |
| Missing/invalid address | `Address not found` | Ask user to select/add address. |
| Closed branch | `Branch is closed`, `Branch is busy`, `Branch is temporarily closed` | Disable checkout, refresh store status. |
| Invalid size/addon | `Size not found for this service`, `Some addons were not found for this service` | Refresh product/cart. |
| Inactive service | `Service is not active` | Remove item from cart. |
| Coupon invalid | See coupon table above | Keep cart, drop coupon or prompt user. |
| Coupon race at create | `409 Coupon is no longer available` | Recalculate and ask user to confirm. |
| Fortune reward invalid | Reward not found/expired/not owned/used | Drop reward and recalculate. |
| Free delivery on pickup | Reward cannot be applied | Drop reward or switch to delivery. |
| Wallet too low | `Insufficient balance` | Ask user for another payment method/top-up. |
| Manual transfer missing receipt | Arabic transfer image/number errors | Require phone and receipt image. |
| Duplicate submit | Existing recent order returned | Navigate to returned order instead of creating another. |

## 15. QA scenarios

Run these before releasing checkout UI:

- Delivery order with no coupon, no reward, no tip.
- Delivery order with tip; confirm `shipping` includes tip.
- Pickup order; confirm `shipping = 0` and no address required.
- Service with default size; card price equals checkout unit price for qty 1.
- Service sale price; show strikethrough and use `effectivePrice`.
- Size sale price; selected size changes cart preview.
- Add-ons; add-on price is not commission-modified.
- Store commission `PERCENTAGE`; client does not add commission again.
- Store commission `FIXED`; per-unit commission scales with quantity.
- Global commission `PERCENTAGE`; platform fee appears once.
- Coupon amount discount.
- Coupon percentage discount capped by max.
- Zone-restricted coupon before address; show select-address hint.
- Zone-restricted coupon after address change; recalculate.
- Fortune `FREE_DELIVERY` with tip; shipping becomes tip.
- `paidWithWallet = true` with insufficient balance.
- `paymentMethod = WALLET` without `transferImage`; show receipt-required error.
- Custom delivery two stops.
- Custom delivery three stops; extra stop fee appears.
- Custom delivery station image upload and attach.
- Custom delivery driver accept, advance, finish with coordinates.
- Cancel paid order; customer sees refund in wallet.

## 16. Known caveats and product decisions

- The API field is `tax`, even if the business label is "service fee".
- Calculate response has `totalPrice`; persisted order/read response has `totalPriceAfterDiscount`.
- Calculate response has `discountValue`; persisted order/read response has `discountAmount`.
- `shipping` includes tip, and the main order read select does not expose a separate `tip` field.
  If the UI needs a separate tip line in history, request a backend response addition.
- Customer coupon list is not a guarantee of checkout eligibility. Checkout calculation is the
  source of truth.
- Store listing `deliveryPrice` is only an estimate. Checkout `shipping` is the source of truth.
- Hosted payment/Kashier routes exist, but the order payment-method enum does not yet distinguish
  online card/provider payment from cash/manual wallet. Confirm backend accounting before enabling
  hosted payment in customer apps.
- `PaymentMethod.WALLET` currently requires manual transfer number and image. `paidWithWallet`
  controls in-app wallet balance deduction.
- Custom delivery calculate is currently unguarded; create is authenticated.

## 17. Source map

Primary implementation files:

| File | Role |
| --- | --- |
| `src/_modules/order/controllers/order.controller.ts` | Regular/custom checkout endpoints. |
| `src/_modules/order/dto/order.dto.ts` | Regular calculate/create DTOs. |
| `src/_modules/order/dto/custom-delivery-order.dto.ts` | Custom delivery DTOs and station images. |
| `src/_modules/order/order.service.ts` | Main pricing, create, status, custom delivery, payment handling. |
| `src/_modules/order/services/helpers.service.ts` | Coupon validation, shipping, tax, custom delivery distance. |
| `src/_modules/serviceModule/services/serviceModule.helper.service.ts` | Store/global commission and service price serialization. |
| `src/_modules/serviceModule/interfaces/service.interface.ts` | Service response fields. |
| `src/_modules/store/controllers/store.controller.ts` | Store commission endpoint and store listing. |
| `src/_modules/store/services/store.service.ts` | Store listing delivery estimate and commission update. |
| `src/_modules/settings/settings.ts` | Settings keys for commission, shipping, tax, assignment. |
| `src/_modules/wallet/wallet.service.ts` | Wallet balance check, deduction, earning distribution, refunds. |
| `src/_modules/payment/kashier/*` | Hosted Kashier payment URL/callback/webhook. |
| `prisma/schema/order.prisma` | Order, order item, custom station, station image models. |
| `prisma/schema/service.prisma` | Service, size, add-on pricing. |
| `prisma/schema/store.prisma` | Store commission and tax. |
| `prisma/schema/enum.prisma` | Order, payment, commission, station enums. |
