# Order Gift Flag (`isGift`)

> Audience: **Mobile (customer + driver apps)** and **Frontend (admin/store dashboard)** teams.
> Surface legend: 🛍️ Customer app · 🚚 Driver app · 🖥️ Admin/Store dashboard

---

## What was added and why

A boolean `isGift` flag has been added to every order. It lets a customer mark an order as a gift at
the time of placement. The driver receives this flag so they can handle the delivery accordingly
(e.g. avoid showing price labels, use gift packaging if provided by the store).

**Default:** `false`. Existing orders and any order that does not send the field are treated as
non-gift orders — no behaviour change for clients that do not adopt this field.

---

## Backend changes summary

| Area | Change |
|---|---|
| `Order` schema | `isGift Boolean @default(false)` column added |
| `ArchivedOrder` schema | Same column added — scheduled gift orders now survive the archive→realize cycle |
| Create order endpoint | `isGift` accepted as optional boolean in request body |
| Create custom delivery endpoint | Same — `isGift` accepted |
| Duplicate-order guard | Guard now differentiates gift vs non-gift orders — two identical orders placed within 20 s with different `isGift` values each produce their own order |
| All order responses | `isGift` is returned in every order list/detail response (customer, driver, admin) |

---

## API changes

### 1. Create order — `POST /api/orders`

**Request body** — add the optional field:

```json
{
  "isGift": true
}
```

- Type: `boolean`
- Required: **no**
- Default when omitted: `false`
- Accepted values: `true` or `false`

No other fields change. All existing requests that omit `isGift` continue to work unchanged.

**Multipart note:** the create-order endpoint accepts `multipart/form-data` (because of the transfer
image upload). Send `isGift` as the string `"true"` or `"false"` — the backend transforms it to a
boolean automatically.

---

### 2. Create custom delivery order — `POST /api/orders/custom-delivery`

Same optional `isGift` field, same rules as above.

---

### 3. Order response — all read endpoints

`isGift` is now present in every order object returned by the API.

Affected endpoints (non-exhaustive):

| Endpoint | Surface |
|---|---|
| `GET /api/orders` | 🛍️ 🖥️ |
| `GET /api/orders/:id` | 🛍️ 🖥️ |
| `GET /api/delivery/orders` (driver order list) | 🚚 |
| `GET /api/delivery/orders/current` (active assignment) | 🚚 |
| `GET /api/delivery/orders/pending` (pending assignments) | 🚚 |

Response shape (partial):

```json
{
  "id": 123,
  "isGift": true,
  "status": "PREPARING",
  ...
}
```

---

## Client integration guide

### 🛍️ Customer app

#### Order placement screen

- Add a **"This is a gift"** toggle or checkbox to the order checkout screen.
- Wire it to the `isGift` field in the create-order request body.
- When unchecked / not shown, omit the field or send `false` — both are equivalent.

#### Order history / order detail screen

- Read `isGift` from the order response.
- Show a gift badge or label on orders where `isGift === true` so the customer can identify their
  gift orders in history.

---

### 🚚 Driver app

#### Pending assignment / active order screens

- `isGift` is included in every order object the driver receives.
- When `isGift === true`, display a visual indicator (e.g. a gift icon 🎁) on the order card so the
  driver is aware before accepting.
- On the active order detail screen, show a prominent gift notice so the driver handles packaging
  and delivery appropriately (e.g. does not show the receipt/price to the recipient).

---

### 🖥️ Admin / Store dashboard

#### Order list and order detail

- `isGift` is returned in all order responses the dashboard already consumes — no endpoint change
  needed.
- Optionally show a gift indicator column in the orders table and a badge in the order detail view.
- Useful for store staff to know they may need to use gift packaging or suppress price labels on the
  delivery note.

#### Filtering (optional future work)

The current API does not expose an `isGift` filter on `GET /api/orders`. If the dashboard needs to
filter gift orders, request a backend filter to be added.

---

## Scheduled (ARCHIVED) orders

Scheduled gift orders are stored in the `ArchivedOrder` table until their `scheduledAt` time.
The `isGift` flag is preserved in the archived row and restored when the order is realized into a
live order — no special handling needed on the client side.

---

## No breaking changes

- Clients that never send `isGift` continue to work — orders are created with `isGift = false`.
- Clients that already read order responses will receive the new `isGift` field; ignoring an unknown
  field is safe in every common HTTP client (JSON deserialization ignores extra keys by default).
- No endpoint URLs, HTTP methods, or required fields changed.
