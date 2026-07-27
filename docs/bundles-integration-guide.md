# Bundles — Frontend / Mobile Integration Guide

## What is it?

Admins or Store owners can create **"Buy X Get Y Free"** promotions. A customer picks the required paid items and chooses which free item(s) they want. The server zeroes the free item's base price and validates everything.

---

## High-Level Flow

```
1. Customer opens a store profile page
   └─ GET /api/stores/:id  →  response now includes a `Bundles` array (detail view only, not the store list)

2. Customer sees available bundles and taps one
   └─ Or: GET /api/bundles?storeId=<id>  →  standalone bundle listing

3. Customer selects paid items + free item(s) from eligible services

4. Customer hits "Calculate"
   └─ POST /api/orders/calculate/order  →  body includes `bundleSelections[]`
   └─ Response shows full price breakdown with free items zeroed

5. Customer confirms and places the order
   └─ POST /api/orders  →  same `bundleSelections[]` in body
   └─ Order is created with OrderBundle + OrderItem records (free items marked `isFree: true`)
```

---

## Where Bundles Appear

| Endpoint | Bundles included? | Notes |
|----------|------------------|-------|
| `GET /api/stores` (list) | **No** | Too expensive for list view |
| `GET /api/stores/:id` (detail) | **Yes** | `Bundles[]` array in store response — only active, within date window |
| `GET /api/bundles?storeId=X` | **Yes** | Standalone endpoint, visitor-friendly (no auth needed) but `storeId` is required for non-admin users |
| `GET /api/bundles/:id` | **Yes** | Single bundle detail, visitor-friendly |

---

## Bundle Object Shape

```jsonc
{
  "id": 1,
  "storeId": 1,
  "title": { "ar": "...", "en": "Buy 2 Get 1 Free" },
  "description": { "ar": "...", "en": "Buy 2 burgers get a pizza free" },
  "image": "https://...",
  "isActive": true,
  "type": "BUY_X_GET_Y_FREE",
  "requiredPaidQuantity": 2,     // customer must select exactly this many paid items
  "freeQuantity": 1,             // customer must select exactly this many free items
  "paidSizeRule": "ANY",         // size constraint for paid items
  "paidRequiredSizeName": null,  // only used when paidSizeRule = "NAME"
  "freeSizeRule": "ANY",         // size constraint for free items
  "freeRequiredSizeName": null,  // only used when freeSizeRule = "NAME"
  "freeValueRule": "CAP_TO_CHEAPEST_PAID",
  "maxFreeItemValue": null,      // only used when freeValueRule = "MAX_FREE_VALUE"
  "startDate": "2026-06-21T00:00:00.000Z",  // null = no start restriction
  "endDate": "2026-07-21T00:00:00.000Z",    // null = no end restriction
  "ScopeServices": [
    { "role": "PAID", "serviceId": 1, "Service": { "id": 1, "name": { "ar": "...", "en": "Classic Burger" } } },
    { "role": "FREE", "serviceId": 2, "Service": { "id": 2, "name": { "ar": "...", "en": "Margherita Pizza" } } }
  ],
  "ScopeCategories": [
    { "role": "PAID", "categoryId": 1, "Category": { "id": 1, "name": { "ar": "...", "en": "Burgers" } } }
  ]
}
```

---

## Enum Values

### `BundleType`
| Value | Meaning |
|-------|---------|
| `BUY_X_GET_Y_FREE` | The only type for now. Buy X paid items, get Y items free. |

### `BundleSizeRule` (applies per role: paid / free)
| Value | Meaning | UI behavior |
|-------|---------|-------------|
| `ANY` | Customer can pick any size (or no size) | Show all sizes as selectable |
| `NAME` | Customer must pick a size whose name matches `paidRequiredSizeName` or `freeRequiredSizeName` | Only show/allow the matching size |

Name matching is **case-insensitive** and checks **all locale values** (both `ar` and `en` of the size name).

### `BundleFreeValueRule`
| Value | Meaning | UI hint |
|-------|---------|---------|
| `NO_CAP` | Any free item is accepted regardless of price | No restrictions to show |
| `CAP_TO_CHEAPEST_PAID` | Free item's base price must be ≤ the cheapest paid item's base price | Show warning or filter eligible free items based on paid selection |
| `MAX_FREE_VALUE` | Free item's base price must be ≤ `maxFreeItemValue` | Show the cap value, filter ineligible items |

**Important:** These rules **reject** the free item if it exceeds the limit — the server does not silently reduce the price. The frontend should prevent the user from selecting ineligible free items.

### `BundleScopeRole`
| Value | Where |
|-------|-------|
| `PAID` | Service/category is eligible as a paid item |
| `FREE` | Service/category is eligible as a free item |

A service can appear in both roles. Check `ScopeServices` and `ScopeCategories` to determine what the customer can pick.

**Eligibility logic:** A service is eligible for a role if:
- It appears in `ScopeServices` with that `role`, OR
- Its category appears in `ScopeCategories` with that `role`

---

## Checkout Payload

### `POST /api/orders/calculate/order` and `POST /api/orders`

Add the `bundleSelections` array alongside the regular `items` array:

```jsonc
{
  "branchId": 1,
  "items": [
    // regular (non-bundle) items go here as before
  ],
  "bundleSelections": [
    {
      "bundleId": 1,
      "paidItems": [
        { "serviceId": 1, "sizeId": 1, "quantity": 1 },
        { "serviceId": 1, "sizeId": 2, "quantity": 1 }
      ],
      "freeItems": [
        { "serviceId": 2, "quantity": 1 }
      ]
    }
  ]
}
```

### Bundle line item fields

| Field | Required | Description |
|-------|----------|-------------|
| `serviceId` | Yes | The service to add |
| `sizeId` | No | Size selection (required if the service has sizes, or if `BundleSizeRule = NAME`) |
| `addonIds` | No | Array of addon IDs — **addons on free items are still charged** |
| `quantity` | No | Defaults to 1. Must be ≥ 1 |

### Quantity rules
- Sum of all `paidItems[].quantity` must equal `bundle.requiredPaidQuantity`
- Sum of all `freeItems[].quantity` must equal `bundle.freeQuantity`

---

## Calculate Response — What's New

The calculate response now includes a `bundles` array and the `items` array includes bundle items:

```jsonc
{
  "price": 135,
  "totalPrice": 149,
  // ... other existing fields unchanged ...

  "items": [
    // Paid bundle items
    {
      "serviceId": 1,
      "sizeId": 1,
      "isFree": false,               // NEW FIELD
      "itemTotalPrice": 60,
      "bundleSelectionIndex": 0       // NEW FIELD — links to bundles[0]
    },
    // Free bundle items
    {
      "serviceId": 2,
      "isFree": true,                // NEW FIELD
      "itemTotalPrice": 0,           // base price zeroed
      "originalBaseValue": 90,       // what it would have cost
      "addonsCharged": 0,            // addons are still charged (0 here because none selected)
      "bundleSelectionIndex": 0      // NEW FIELD
    }
  ],

  "bundles": [                        // NEW ARRAY
    {
      "selectionIndex": 0,
      "bundle": { /* full bundle object */ },
      "freeDiscountAmount": 90,       // total discount from free items
      "snapshot": {
        "bundleId": 1,
        "title": { "ar": "...", "en": "..." },
        "paidItems": [
          { "serviceId": 1, "quantity": 1, "originalBaseValue": 60, "discountAmount": 0, "finalLinePrice": 60 }
        ],
        "freeItems": [
          { "serviceId": 2, "quantity": 1, "originalBaseValue": 90, "discountAmount": 90, "finalLinePrice": 0 }
        ]
      }
    }
  ]
}
```

---

## Order Response — What's New

After placing an order, `OrderItem` records now include:

| New field | Type | Description |
|-----------|------|-------------|
| `isFree` | `boolean` | `true` if this item was the free part of a bundle |
| `orderBundleId` | `int?` | Links to the `OrderBundle` record (null for non-bundle items) |

The order also has an `OrderBundles` relation containing the bundle snapshot at the time of purchase.

---

## What's Allowed / Not Allowed

### Allowed
- Mix regular items + bundle selections in the same order
- Multiple bundle selections in one order (same or different bundles)
- Addons on free items (they are charged normally, only the base price is zeroed)
- A service can be eligible for both PAID and FREE roles
- Visitors can browse bundles (`GET /bundles?storeId=X`)
- Store owners can create/update/delete their own bundles

### Not Allowed
- **Bundles + Coupon** in the same order → `400: Bundles cannot be combined with other discounts`
- **Bundles + Fortune reward** in the same order → same error
- **Bundles on SCHEDULED orders** → `400: Bundles are not supported for scheduled orders`
- **Bundles on CUSTOM_DELIVERY orders** → not applicable (different order flow)
- **Free item exceeding value cap** → `400: Free item value exceeds the bundle limit` (when `CAP_TO_CHEAPEST_PAID` or `MAX_FREE_VALUE` applies)
- **Wrong quantities** → `400` if paid/free item counts don't match the bundle's `requiredPaidQuantity`/`freeQuantity`
- **Ineligible service** → `400: Service is not eligible for this bundle role`
- **Cross-store** → bundle services must belong to the same store as the branch

---

## Store Profile Changes

When fetching a single store (`GET /api/stores/:id`), the response now includes:

```jsonc
{
  // ... existing store fields ...
  "Bundles": [
    { /* bundle object — same shape as GET /api/bundles/:id */ }
  ]
}
```

- **Store list** (`GET /api/stores`): `Bundles` is **not included** (performance)
- **Store detail** (`GET /api/stores/:id`): `Bundles` **is included** — only active ones within the valid date window
- Use this to show a "Promotions" / "Offers" section on the store profile page

---

## Admin / Store Owner — Bundle Management

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/bundles` | Store owner / Admin | Create a bundle (multipart/form-data with image) |
| `PATCH /api/bundles/:id` | Store owner / Admin | Update bundle fields (only send fields you want to change) |
| `GET /api/bundles?storeId=X` | Any (visitor OK) | List bundles for a store |
| `GET /api/bundles/:id` | Any (visitor OK) | Get single bundle |
| `DELETE /api/bundles/:id` | Store owner / Admin | Soft-delete a bundle |

### Create/Update fields

> **Content type:** `multipart/form-data` (because of the image file upload).

| Field | Required on create | Type | Description |
|-------|-------------------|------|-------------|
| `title` | **Yes** | `{ ar, en }` JSON string | Bundle title (bilingual) |
| `description` | **Yes** | `{ ar, en }` JSON string | Bundle description (bilingual) |
| `image` | **Yes** | **file upload** | Bundle image (binary file, not a URL) |
| `storeId` | **Yes** | number | Auto-attached for store owners via `@AttachStoreId` |
| `requiredPaidQuantity` | **Yes** | number (≥1) | How many paid items the customer must select |
| `freeQuantity` | **Yes** | number (≥1) | How many free items the customer gets |
| `isActive` | No | boolean | Default `true` |
| `type` | No | `BUY_X_GET_Y_FREE` | Default `BUY_X_GET_Y_FREE` |
| `paidSizeRule` | No | `ANY` / `NAME` | Default `ANY` |
| `paidRequiredSizeName` | **Conditional** | string | **Required** when `paidSizeRule = NAME` |
| `freeSizeRule` | No | `ANY` / `NAME` | Default `ANY` |
| `freeRequiredSizeName` | **Conditional** | string | **Required** when `freeSizeRule = NAME` |
| `freeValueRule` | No | `NO_CAP` / `CAP_TO_CHEAPEST_PAID` / `MAX_FREE_VALUE` | Default `CAP_TO_CHEAPEST_PAID` |
| `maxFreeItemValue` | **Conditional** | number | **Required** when `freeValueRule = MAX_FREE_VALUE` |
| `startDate` | No | ISO date | Bundle becomes active after this date (null = immediately) |
| `endDate` | No | ISO date | Bundle expires after this date (null = never) |
| `paidServiceIds` | **Conditional*** | number[] (comma-separated) | Services eligible as paid items |
| `paidCategoryIds` | **Conditional*** | number[] (comma-separated) | Categories eligible as paid items |
| `freeServiceIds` | **Conditional*** | number[] (comma-separated) | Services eligible as free items |
| `freeCategoryIds` | **Conditional*** | number[] (comma-separated) | Categories eligible as free items |

#### Scope rules (important)

- **On create:** you must provide at least one **paid** scope (`paidServiceIds` or `paidCategoryIds`) AND at least one **free** scope (`freeServiceIds` or `freeCategoryIds`). The server rejects the request otherwise.
- **On update:** if you change **any** scope array, you must send **all four** (`paidServiceIds`, `paidCategoryIds`, `freeServiceIds`, `freeCategoryIds`). This is a full replacement, not a merge.
- All scoped services/categories must belong to the bundle's store.

#### Conditional field rules

| If you set... | Then you must also provide... |
|---------------|------------------------------|
| `paidSizeRule = NAME` | `paidRequiredSizeName` (e.g. `"Small"`) |
| `freeSizeRule = NAME` | `freeRequiredSizeName` (e.g. `"Regular"`) |
| `freeValueRule = MAX_FREE_VALUE` | `maxFreeItemValue` (e.g. `50`) |

---

## Quick Summary for Mobile

1. **Fetch bundles** from the store profile or `GET /bundles?storeId=X`
2. **Show eligible items** — use `ScopeServices` + `ScopeCategories` to filter what the user can pick for paid vs free roles
3. **Enforce quantity** — UI should enforce `requiredPaidQuantity` for paid picks and `freeQuantity` for free picks
4. **Enforce value cap** — if `freeValueRule` is not `NO_CAP`, filter/warn about free items that exceed the limit
5. **Send `bundleSelections[]`** in calculate/create order body
6. **Display free items** — show `isFree: true` items with a strikethrough price or "FREE" badge
7. **Show discount** — use `freeDiscountAmount` from the bundles array to display total savings

---

## Testing Examples

Below are ready-to-use requests you can test with in Swagger or Postman. All examples assume:
- Store ID: `1`, Branch ID: `1`
- Service 1: Classic Burger (price: 75, sizes: Small=60, Large=75)
- Service 2: Margherita Pizza (price: 90)
- Addons on service 1: Extra Cheese (id:1, 10 EGP), Extra Sauce (id:2, 5 EGP)

---

### Example 1: Create a bundle

**`POST /api/bundles`** — `multipart/form-data`, Auth: store owner or admin

| Field | Value |
|-------|-------|
| `title` | `{"ar":"اشتري 2 واحصل على 1 مجاناً","en":"Buy 2 Get 1 Free"}` |
| `description` | `{"ar":"اشتري 2 برجر واحصل على بيتزا مجاناً","en":"Buy 2 burgers get a pizza free"}` |
| `image` | *(upload a file)* |
| `storeId` | `1` |
| `requiredPaidQuantity` | `2` |
| `freeQuantity` | `1` |
| `isActive` | `true` |
| `freeValueRule` | `NO_CAP` |
| `paidServiceIds` | `1` |
| `freeServiceIds` | `2` |

**Expected:** `201` — `"bundle created successfully"`

---

### Example 2: Calculate order — bundle only

**`POST /api/orders/calculate/order`** — `application/json`, Auth: required

```json
{
  "branchId": 1,
  "items": [],
  "bundleSelections": [
    {
      "bundleId": 1,
      "paidItems": [
        { "serviceId": 1, "sizeId": 1, "quantity": 1 },
        { "serviceId": 1, "sizeId": 2, "quantity": 1 }
      ],
      "freeItems": [
        { "serviceId": 2, "quantity": 1 }
      ]
    }
  ]
}
```

**Expected:** `200`
- `price: 135` (Small 60 + Large 75)
- Free pizza: `isFree: true`, `itemTotalPrice: 0`
- `freeDiscountAmount: 90`

---

### Example 3: Calculate order — bundle + normal items

**`POST /api/orders/calculate/order`** — `application/json`, Auth: required

```json
{
  "branchId": 1,
  "items": [
    { "serviceId": 2, "quantity": 1 }
  ],
  "bundleSelections": [
    {
      "bundleId": 1,
      "paidItems": [
        { "serviceId": 1, "sizeId": 1, "quantity": 1 },
        { "serviceId": 1, "sizeId": 2, "quantity": 1 }
      ],
      "freeItems": [
        { "serviceId": 2, "quantity": 1 }
      ]
    }
  ]
}
```

**Expected:** `200`
- 4 items total: 1 normal pizza (90) + 2 paid burgers (60+75) + 1 free pizza (0)
- `price: 225`
- `freeDiscountAmount: 90`
- Normal item has no `bundleSelectionIndex`, bundle items have `bundleSelectionIndex: 0`

---

### Example 4: Calculate order — free item with addons (addons are charged)

Requires a bundle where the free-scoped service has addons (e.g. bundle with `freeServiceIds: [1]`).

**`POST /api/orders/calculate/order`** — `application/json`, Auth: required

```json
{
  "branchId": 1,
  "items": [],
  "bundleSelections": [
    {
      "bundleId": 2,
      "paidItems": [
        { "serviceId": 2, "quantity": 2 }
      ],
      "freeItems": [
        { "serviceId": 1, "sizeId": 1, "addonIds": [1, 2], "quantity": 1 }
      ]
    }
  ]
}
```

**Expected:** `200`
- Paid: 2x pizza = 180
- Free burger: base (60) zeroed, but **addons charged** (10 + 5 = 15)
- Free item: `isFree: true`, `itemTotalPrice: 15`, `addonsCharged: 15`
- `freeDiscountAmount: 60`
- `price: 195` (180 + 15 addons)

---

### Example 5: Edge case — wrong paid quantity (should fail)

**`POST /api/orders/calculate/order`** — `application/json`, Auth: required

```json
{
  "branchId": 1,
  "items": [],
  "bundleSelections": [
    {
      "bundleId": 1,
      "paidItems": [
        { "serviceId": 1, "sizeId": 1, "quantity": 1 }
      ],
      "freeItems": [
        { "serviceId": 2, "quantity": 1 }
      ]
    }
  ]
}
```

**Expected:** `400` — `"Paid bundle quantity does not match the offer"` (sent 1, bundle requires 2)

---

### Example 6: Edge case — ineligible free service (should fail)

**`POST /api/orders/calculate/order`** — `application/json`, Auth: required

```json
{
  "branchId": 1,
  "items": [],
  "bundleSelections": [
    {
      "bundleId": 1,
      "paidItems": [
        { "serviceId": 1, "sizeId": 1, "quantity": 1 },
        { "serviceId": 1, "sizeId": 2, "quantity": 1 }
      ],
      "freeItems": [
        { "serviceId": 1, "quantity": 1 }
      ]
    }
  ]
}
```

**Expected:** `400` — `"Service is not eligible for this bundle role"` (service 1 is PAID-scoped, not FREE)

---

### Example 7: Edge case — bundle + coupon (should fail)

**`POST /api/orders/calculate/order`** — `application/json`, Auth: required

```json
{
  "branchId": 1,
  "couponCode": "ANY_CODE",
  "items": [],
  "bundleSelections": [
    {
      "bundleId": 1,
      "paidItems": [
        { "serviceId": 1, "sizeId": 1, "quantity": 2 }
      ],
      "freeItems": [
        { "serviceId": 2, "quantity": 1 }
      ]
    }
  ]
}
```

**Expected:** `400` — `"Bundles cannot be combined with other discounts"`
