# Seed Test Data — Makanak API

## Running the Seed

```powershell
# One-time setup (if not already done)
npm install
npm run db:generate

# Seed the database
npm run db:seed
```

The seed is **idempotent** — every write uses `upsert`. Re-running it is safe and will not
duplicate data or fail on unique constraint errors.

---

## Test Credentials

| Role        | Email                    | Password       | User ID |
|-------------|--------------------------|----------------|---------|
| Admin       | admin@makanak.com        | Admin@1234     | 9       |
| Admin (legacy) | a@a.com               | Default@123    | 2       |
| Store Owner | owner@makanak.com        | Owner@1234     | 10      |
| Customer    | customer@makanak.com     | Customer@1234  | 11      |
| Driver      | driver@makanak.com       | Driver@1234    | 12      |

All users are `verified: true`. Passwords are bcrypt-hashed with salt 10.

**Swagger login locale**: use `"en"` or `"ar"` — both languages are seeded.

---

## Key Seeded Entities

### Geography
| Entity        | ID | Details                                                   |
|---------------|----|-----------------------------------------------------------|
| City          | 1  | Cairo (`القاهرة`)                                         |
| Zone          | 1  | Central Cairo — polygon ±0.02° around (30.0490, 31.2390) |

The zone polygon covers:
- Branch: (30.0500, 31.2400)
- Customer address: (30.0480, 31.2380)
- Driver location: (30.0510, 31.2410)

Point-in-polygon checks will pass for all three test coordinates.

### Store & Branch
| Entity  | ID | Details                                              |
|---------|----|------------------------------------------------------|
| Module  | 3  | Restaurant (`RESTAURANT` type)                       |
| Store   | 1  | Test Restaurant — accepted, verified, moduleId=3     |
| Branch  | 1  | Test Branch – Cairo — main branch, isActive=true     |

The branch is linked to zone 1 via `BranchZone` and has a full 7-day schedule (08:00–23:00).

### Services
| ID | Name              | Price | priceAfterDiscount | Notes                          |
|----|-------------------|-------|--------------------|--------------------------------|
| 1  | Classic Burger    | 75    | 60                 | Has service-level discount     |
| 2  | Margherita Pizza  | 90    | null               | Discount at size level instead |

### Service Sizes
| ID | Service | Name    | Price | priceAfterDiscount |
|----|---------|---------|-------|--------------------|
| 1  | Burger  | Small   | 60    | null               |
| 2  | Burger  | Large   | 90    | 75                 |
| 3  | Pizza   | Regular | 90    | 80                 |

### Service Addons
| ID | Service | Name        | Price |
|----|---------|-------------|-------|
| 1  | Burger  | Extra Cheese | 10   |
| 2  | Burger  | Extra Sauce  | 5    |

### Coupon
| ID | Code      | Type       | Discount | Min Order |
|----|-----------|------------|----------|-----------|
| 1  | WELCOME10 | ALL_USERS  | 10%      | 50 EGP    |

### Orders
| ID | Status    | Customer | Branch | Driver | Notes                         |
|----|-----------|----------|--------|--------|-------------------------------|
| 1  | PENDING   | 11       | 1      | —      | Test order for Swagger testing |
| 2  | DELIVERED | 11       | 1      | 12     | Has ratings and a complaint   |

---

## Bulk Data (for list/pagination endpoints)

| Entity          | Count | ID Range |
|-----------------|-------|----------|
| Cities          | 50    | 1–50     |
| Zones           | 50    | 1–50     |
| Modules         | 50    | 1–50     |
| Plans           | 50    | 1–50     |
| Banks           | 50    | 1–50     |
| Stores          | 50    | 1–50     |
| Branches        | 50    | 1–50     |
| Categories      | 50    | 1–50     |
| Services        | 50    | 1–50     |
| Service Sizes   | ~53   | 1–53     |
| Service Addons  | ~52   | 1–52     |
| Orders          | 50    | 1–50     |
| Coupons         | 50    | 1–50     |
| Banners         | 50    | 1–50     |
| Specialists     | 50    | 1–50     |
| BankAccounts    | 50    | 1–50     |
| Bulk Customers  | 10    | 51–60    |

---

## Example Swagger Test Flows

### 1. Login as Customer
```
POST /api/auth/customer/login
{
  "email": "customer@makanak.com",
  "password": "Customer@1234",
  "locale": "en",
  "fcm": "test-fcm-token"
}
```
Copy the `AccessToken` from the response. Use it as Bearer token for subsequent requests.

### 2. Browse Stores
```
GET /api/stores
```
Returns stores list. The test store (id=1) is "Test Restaurant".

### 3. Browse Services in the Test Store
```
GET /api/services?storeId=1
```
Returns Classic Burger and Margherita Pizza with their `priceAfterDiscount` values.

### 4. Create an Order
```
POST /api/orders
Authorization: Bearer <customer_token>
{
  "branchId": 1,
  "addressId": 1,
  "paymentMethod": "CASH",
  "type": "DELIVERY",
  "items": [
    { "serviceId": 1, "sizeId": 1, "quantity": 1, "addons": [1] }
  ]
}
```

### 5. View Order History
```
GET /api/orders
Authorization: Bearer <customer_token>
```

### 6. Apply Coupon
Use coupon code `WELCOME10` when creating an order (if the endpoint supports it).

### 7. Login as Driver and Check Assignments
```
POST /api/auth/delivery/login
{
  "email": "driver@makanak.com",
  "password": "Driver@1234",
  "locale": "en",
  "fcm": "test-driver-fcm"
}
```
Then: `GET /api/orders` (driver view) to see assigned orders.

### 8. Login as Admin
```
POST /api/auth/admin/login
{
  "email": "admin@makanak.com",
  "password": "Admin@1234",
  "locale": "en",
  "fcm": "test-admin-fcm"
}
```

### 9. Login as Store Owner
```
POST /api/auth/store/login
{
  "email": "owner@makanak.com",
  "password": "Owner@1234",
  "locale": "en",
  "fcm": "test-store-fcm"
}
```

### 10. Rate a Delivered Order
```
POST /api/storerating
Authorization: Bearer <customer_token>
{
  "orderId": 2,
  "rating": 5,
  "comment": "Excellent!"
}
```
Order 2 is pre-seeded as DELIVERED and already has seed ratings — use a new order from step 4.

---

## What Was NOT Seeded and Why

| Entity              | Reason                                                                              |
|---------------------|-------------------------------------------------------------------------------------|
| Sessions/JWTs       | Real tokens are generated at login time; seeding stale JTIs is misleading.         |
| OTPs (all users)    | Only customer OTPs seeded; admin/driver OTPs not needed for Swagger flows.          |
| DeliverySchedule    | Complex availability logic; not required for basic order assignment testing.         |
| FortuneWheel        | Not part of core order/delivery flow; seeded separately via admin UI if needed.      |
| Campaigns           | Admin-managed feature; seed not needed for standard Swagger testing.                 |
| ArchivedOrders      | Archives are created by the app's archival cron; not seeded manually.               |
| OrderStations       | Custom-delivery-specific; use `POST /api/orders` with `type: CUSTOM_DELIVERY`.      |
| Logs                | System-generated; not meaningful to pre-seed.                                        |
| Variation Templates | Admin feature; seed on demand via Swagger if needed.                                 |

---

## Notes

- The admin wallet (id=1) is also created by `admin.seed.ts`. Both seeds use `upsert` so there
  is no conflict.
- `seedModule` and `seedCategory` (in their individual seed files) check `count > 0` before
  inserting. Since `seedComprehensiveData` runs after them in the main seed, those guards will
  cause the individual seeders to skip — the comprehensive seed owns those tables.
- Passwords use `bcrypt.hashSync(plain, 10)`. If `HASH_SALT` in `.env` differs from 10 the
  login will succeed because the hash rounds are stored in the bcrypt output; the app reads the
  salt from the hash, not from the env var at compare time.
- All bilingual fields (name, description, etc.) follow the pattern `{ en: "...", ar: "..." }`.
