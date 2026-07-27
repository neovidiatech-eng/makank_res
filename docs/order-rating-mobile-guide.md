# Order Rating — Mobile Integration Guide 🛍️

> Audience: **Mobile (customer app)** team.
> Purpose: how to build the "rate your order" screen for the store and the driver.
> Base URL: all routes are prefixed with **`/api`**. Server port `3030`.
> Swagger UI: `http://localhost:3030/api/docs`.
>
> Source of truth: the live controller/DTO (`order.controller.ts`, `order.rate.dto.ts`),
> the `rateOrder` service (`order.service.ts`), and the order response `ratingEligibility`
> block — not assumptions.

---

## TL;DR

- A customer rates the **store** and/or the **driver** of a **delivered** order.
- **One screen, one request.** Show whatever inputs are allowed, collect the values, and send a
  **single** `POST /api/orders/:id/rate`.
- Rating is **once per order**. After the first successful submission the order is locked
  (`rated = true`) and any further rating attempt is rejected.
- **Do not** infer eligibility from `branchId` / `deliveryId` yourself — read the
  server-provided **`ratingEligibility`** flags on the order.

---

## 1. Read eligibility from the order response

Every order returned by the order list / detail endpoints
(`GET /api/orders`, `GET /api/orders/:id`) now includes a `ratingEligibility` block:

```jsonc
{
  "id": 123,
  "status": "DELIVERED",
  "rated": false,
  // ...
  "ratingEligibility": {
    "canRateStore": true,    // store input may be shown
    "canRateDriver": true,   // driver input may be shown
    "canSubmitRating": true, // at least one of the above is true → show the Rate button
    "alreadyRated": false    // true once the order has been rated
  }
}
```

### What the flags mean (computed on the server)

| Flag | True when |
|---|---|
| `canRateStore` | order is `DELIVERED`, not yet rated, **and** the order has a branch with a parent store |
| `canRateDriver` | order is `DELIVERED`, not yet rated, **and** a driver was assigned |
| `canSubmitRating` | `canRateStore || canRateDriver` — use this to decide whether to show the Rate entry point at all |
| `alreadyRated` | the order's `rated` flag — show "already rated" / hide the Rate button |

> These mirror exactly what the backend enforces on submit, so if a flag is `false`, sending that
> rating anyway will be rejected. Trust the flags.

---

## 2. Build the rating screen

Use the flags to decide which inputs to render on **one** screen:

| `canRateStore` | `canRateDriver` | Screen shows |
|:---:|:---:|---|
| ✅ | ✅ | Store rating **and** driver rating inputs together |
| ✅ | ❌ | Store rating input only |
| ❌ | ✅ | Driver rating input only |
| ❌ | ❌ | No rating screen — `canSubmitRating` is `false` (hide the Rate button) |

Each rating input is a **1–5** star/number plus an optional free-text comment.

> A driver-only screen happens for orders with no assigned driver's counterpart — e.g. a pickup
> order has no driver, so only the store can be rated. An order whose branch has no parent store
> can only have its driver rated.

---

## 3. Submit — one request for the whole screen

### `POST /api/orders/:id/rate`

**Auth:** access token (the order's own customer only).

**Body** — send the inputs you showed; **at least one** of `storeRate` / `deliveryRate` is required:

```jsonc
{
  "storeRate": 5,                  // optional, 1–5
  "storeComment": "Fast and fresh",// optional
  "deliveryRate": 4,               // optional, 1–5
  "deliveryComment": "Polite driver" // optional
}
```

- Rating both → send all four fields.
- Rating the store only → send `storeRate` (+ optional `storeComment`).
- Rating the driver only → send `deliveryRate` (+ optional `deliveryComment`).

**Send everything in this one call.** There is **no** "rate the driver later" follow-up request —
the first successful submission locks the order.

**Success:** `200`. The order's `rated` becomes `true`; on the next fetch
`ratingEligibility.alreadyRated` is `true` and `canRateStore` / `canRateDriver` are `false`.

---

## 4. Validation & error responses

All failures return `400` with a message:

| Situation | Message |
|---|---|
| Neither `storeRate` nor `deliveryRate` sent | `Provide a store or delivery rating` |
| `deliveryRate` sent but the order has no driver | `This order has no driver to rate` |
| `storeRate` sent but the order has no branch / store | `This order has no store to rate` |
| `storeRate` / `deliveryRate` outside **1–5** | validation error on the field |
| Order already rated | `You have already rated this store` |
| Order not delivered yet | `Your Order to this store is not completed` |
| Not the order's customer | `You do not have access to this order` |

If you drive the UI from `ratingEligibility`, the first three should never happen — they're the
server enforcing the same rules client-side gating prevents.

---

## 5. Do / Don't

**Do**
- Gate the Rate button on `ratingEligibility.canSubmitRating`.
- Show store/driver inputs based on `canRateStore` / `canRateDriver`.
- Submit the whole screen in one `POST /api/orders/:id/rate`.
- Treat `alreadyRated` as terminal (no re-rating).

**Don't**
- Don't decide eligibility from `branchId` / `deliveryId` / `status` yourself — use the flags.
- Don't split store and driver into two separate submit requests.
- Don't offer a "rate later" path for the other target after one submission — it will 400.
