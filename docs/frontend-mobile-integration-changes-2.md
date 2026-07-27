# Frontend & Mobile Integration — Changes Report (Part 2 / Addendum)

> Audience: **Frontend (admin/store dashboard)** and **Mobile (customer + driver apps)** teams.
> Purpose: capture every backend change that requires client work **since Part 1**
> ([`frontend-mobile-integration-changes.md`](./frontend-mobile-integration-changes.md)). Read
> Part 1 first — this addendum only adds the deltas, it does not repeat them.
> Base URL: all routes are prefixed with **`/api`**. Server port `3030`.
> Swagger UI: `http://localhost:3030/api/docs`.
>
> Source of truth: the docs under `/docs`, the live controllers/DTOs, and the Prisma schema —
> not assumptions. Behavior enforced in the service (not the DTO) is called out explicitly.

**Surface legend:** 🛍️ Customer app · 🚚 Driver app · 🖥️ Admin/Store dashboard

**What changed since Part 1:** Custom-delivery orders now support **customer-uploaded images per
station** (a photo of the exact part to buy, a prescription, a reference picture). This is the only
client-facing change since the Part 1 report. The deployment/Docker work that also landed is
infrastructure only — no client impact.

---

## Table of Contents

1. [New APIs](#1-new-apis)
2. [Endpoint Changes](#2-endpoint-changes)
3. [New Screens / Feature Updates](#3-new-screens--feature-updates)
4. [Request Validation Changes](#4-request-validation-changes)
5. [Response Model Changes](#5-response-model-changes)
6. [Station Images Integration Guide](#6-station-images-integration-guide)
7. [Breaking Changes](#7-breaking-changes)
8. [Swagger Review](#8-swagger-review)
9. [Summary Table](#9-summary-table)

---

## 1. New APIs

### Custom Delivery — Upload station images 🛍️

#### `POST /api/orders/custom-delivery/images` — Upload one or more station images

A customer attaches **0, 1, or many images per station** on a custom-delivery order (and **only**
custom-delivery — normal orders are unaffected). Because the stations don't exist yet while the
customer is filling the form, images are uploaded in a **separate request first**. The upload
returns integer **image ids**; the client then embeds those ids under each stop when creating the
order (see [§4](#4-request-validation-changes) and the [guide](#6-station-images-integration-guide)).

**Auth:** access token + `orders` permission (any authenticated customer).
**Content-Type:** `multipart/form-data`. **Field name:** `images` (repeatable file field).

| Rule | Value |
|------|-------|
| Field name | `images` (send one or more files under the same key) |
| Max files / request | **10** |
| Max size / file | **5 MB** |
| Allowed types | `image/*` only (`image/jpeg`, `image/png`, `image/webp`, …) — non-images rejected |

**Response — `201`:**

```json
{ "message": "images uploaded successfully", "data": { "imageIds": [12, 13] } }
```

The returned ids belong to the authenticated user and stay **unused** until an order consumes them.
The client only ever sends back ids the server issued — never a file path or URL.

> The owner is taken from the auth token; the request body carries **only** the files. You can call
> this endpoint as many times as you like (e.g. once per station) and collect the ids — there is no
> requirement to upload all of an order's images in a single call.

Priority: **High** (customer app)

---

## 2. Endpoint Changes

### Custom-delivery create — `stops[].imageIds` 🛍️

`POST /api/orders/custom-delivery` now accepts an optional **`imageIds`** array on each stop. See
[Request Validation Changes](#4-request-validation-changes). Existing calls that omit it are
unaffected. Priority: **High**

### Custom-delivery reads — stations now carry `Images` 🛍️ 🚚

Every endpoint that returns custom-delivery stations now nests an **`Images`** array on each station:
customer order detail/list (`GET /api/orders`, `GET /api/orders/:id`), and all driver
order/assignment reads (`GET /api/delivery/me/current-assignment`,
`GET /api/delivery/me/pending-assignments`). See [Response Model Changes](#5-response-model-changes).
The driver now sees the customer's reference photos per station. Priority: **High**

### Clearer multipart JSON error (custom-delivery create) 🛍️

`stops` is sent as a JSON **string** inside the multipart body and parsed server-side. Malformed JSON
now returns a clear, field-named **`400`** — `Invalid JSON in field stops` (en) /
`صيغة JSON غير صالحة في الحقل stops` (ar), localized via i18n — instead of the previous misleading
`ArrayMinSize` "array must contain at least 2 elements" error. No client change required, but error
handling can now surface this message directly. Priority: **Low**

---

## 3. New Screens / Feature Updates

### Custom delivery — add photos per station 🛍️
- In the station form (per stop), add an **image picker** (camera/gallery, multi-select).
- On selection, upload via `POST /api/orders/custom-delivery/images` and keep the returned `imageIds`
  **associated with that specific stop** in local state.
- On order submit, include each stop's collected ids as `stops[i].imageIds`.
- Enforce client-side limits to match the server: **≤ 5 images per station**, **≤ 20 per order**,
  images only, **≤ 5 MB** each, **≤ 10 files per upload request**.
- Show thumbnails + a remove control before submit (removing locally is enough — unattached uploads
  are auto-reaped server-side after 24h; see the [guide](#6-station-images-integration-guide)).
Priority: **High**

### Custom delivery — show station photos 🚚 🛍️
- In the driver's per-station view (New / In Progress / History tabs) render each station's `Images`
  so the driver can see exactly what to buy/pick up.
- In the customer's order-tracking detail, show the photos they attached per station (read-only).
Priority: **High**

---

## 4. Request Validation Changes

### Custom-delivery create — `stops[].imageIds` 🛍️

On `POST /api/orders/custom-delivery`, each stop object may include:

| Field | Type | Rules |
|---|---|---|
| `stops[].imageIds` | `number[]` | Optional. Array of **≤ 5** integer image ids returned by `POST /custom-delivery/images`. Each id must be **your own** and **unused**. |

Cross-station limit (enforced in the service, not the DTO): **≤ 20** image ids per order across all
stations. Validation/attach is **all-or-nothing** — any invalid id rejects the whole order with a
`400`; nothing is partially created.

Example create body (stops ride inside the multipart JSON string — `imageIds` are **not** file
uploads on this request; the files were already uploaded in the separate call):

```jsonc
{
  "stops": [
    { "lat": 24.71, "lng": 46.67, "name": "ورشة النور", "purchaseList": "مفك + مسامير", "estimatedCost": 50, "imageIds": [12, 13] },
    { "lat": 24.74, "lng": 46.69, "name": "سوبر ماركت", "purchaseList": "موز 2 كيلو", "estimatedCost": 30, "imageIds": [14] },
    { "lat": 24.75, "lng": 46.71, "name": "بيت العميل", "label": "الدار" }   // no images on this stop
  ],
  "paymentMethod": "CASH"
}
```

**Failure cases to handle (all `400`).** These messages are **hardcoded Arabic literals** in the
service (they are *not* locale-switched), so the API returns the Arabic text regardless of `locale` —
key off the HTTP status, not the string:

| Cause | Returned message (ar) | English gloss |
|---|---|---|
| An id doesn't exist, isn't yours, or is already used | `بعض الصور غير صالحة أو مستخدمة من قبل` | Some images are invalid or already used |
| Same id sent more than once (within/across stations) | `لا يمكن استخدام نفس الصورة أكثر من مرة` | Can't use the same image more than once |
| More than 5 ids on one station | `لا يمكن إرفاق أكثر من 5 صور لكل محطة` | Max 5 per station (also DTO `@ArrayMaxSize(5)`) |
| More than 20 ids across the order | `لا يمكن إرفاق أكثر من 20 صورة للطلب الواحد` | Max 20 per order |

**Frontend Action:** mirror these limits client-side so the user gets immediate feedback, and treat
the create call as atomic — on a `400`, the order was **not** created; the uploaded images remain
valid and can be retried. Priority: **High**

---

## 5. Response Model Changes

### Custom-delivery station object — new `Images` array 🛍️ 🚚

Each `OrderStation` returned anywhere (customer + driver reads) now carries an `Images` array, in
upload order. Empty (`[]`) when the station has no photos or for legacy orders predating the feature.

```jsonc
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

`image` is a server-resolved relative path (`uploads/orders/…`) — prefix with the asset base URL the
same way you render other uploads. **Frontend Action:** add `Images: { id: number; image: string }[]`
to the station typing/model. Priority: **High**

### Upload response 🛍️
`POST /custom-delivery/images` → `{ data: { imageIds: number[] } }`. Add a model for it. Priority: **High**

---

## 6. Station Images Integration Guide

A self-contained flow for the team building the custom-delivery image feature.

### Concept
- Images are **per-station** and **single-use**: one uploaded image attaches to exactly one station
  of one order, and only by the customer who uploaded it.
- Because stations don't exist until the order is created, you **upload first → get ids → embed ids
  on create**. The client never sends file paths or URLs, only server-issued integer ids.

### End-to-end sequence

```
1. POST /api/orders/custom-delivery/images   (multipart, field `images`)  ──►  { data: { imageIds: [12, 13] } }
        (repeat per station as needed; keep each station's ids in local state)
2. POST /api/orders/custom-delivery          (stops[i].imageIds = [12, 13], …)
        └─ inside the create transaction each stop's ids are validated + attached to its station by sequence
3. GET  /api/orders/:id                       (each station carries Images: [{ id, image }])
```

### Customer app 🛍️
1. Per station, let the user pick images and upload them via `POST /custom-delivery/images`. Keep the
   returned ids tied to **that** station in your form state (don't pool them across stations).
2. Respect the limits up front: ≤ 5 per station, ≤ 20 per order, `image/*` only, ≤ 5 MB/file, ≤ 10
   files per upload request.
3. On submit, send each station's ids as `stops[i].imageIds`. Treat the create as atomic — on `400`,
   show the returned message and let the user retry (the uploaded images are still valid).
4. After success, read the order back and render each station's `Images`.

### Driver app 🚚
- Render each station's `Images` in the per-station working view so the driver sees the customer's
  reference photos for that stop.

### What you do NOT need to handle
- **Cleanup of abandoned uploads.** If a customer uploads images but never creates the order (or a
  duplicate idempotent create returns the earlier order), those images stay unattached and are
  automatically deleted by a daily server cron after 24 h. No client cleanup call exists or is needed.

Priority: **High**

---

## 7. Breaking Changes

**None.** This release is **purely additive**:
- `stops[].imageIds` is optional; omitting it behaves exactly as before.
- The new `Images` array is always present on stations but is `[]` for orders without photos and for
  legacy custom orders predating the feature — existing parsers that ignore unknown fields are
  unaffected.
- The clearer `Invalid JSON in field "stops"` message replaces a previous misleading one on the same
  `400` path — same status code, better text.

---

## 8. Swagger Review

Re-import / regenerate clients from `http://localhost:3030/api/docs` (or the committed
`swagger-spec.json`) for the **Orders** tag.

**New path**
- `POST /api/orders/custom-delivery/images` (multipart `images[]` → `{ imageIds }`).

**Changed models**
- `DeliveryStopDTO` / custom-delivery create body: added optional `imageIds: number[]` per stop.
- `OrderStation` in all order/assignment responses: added nested `Images: { id, image }[]`.

**Action:** regenerate the `Orders` (and any `Delivery` assignment) models so station typings include
`Images`, and add the upload endpoint + `UploadStationImagesDTO`.

---

## 9. Summary Table

| Change | Frontend/Mobile Action Required | Surface | Priority |
|---|---|---|---|
| Upload station images | New `POST /custom-delivery/images` (multipart `images`); collect returned `imageIds` per station | 🛍️ | **High** |
| `stops[].imageIds` on create | Embed each station's ids on `POST /custom-delivery`; enforce ≤5/station, ≤20/order; handle atomic `400` | 🛍️ | **High** |
| Station `Images` in reads | Add `Images: { id, image }[]` to station model; render per station | 🛍️ 🚚 | **High** |
| Clearer multipart JSON error | Optionally surface `Invalid JSON in field "stops"` | 🛍️ | **Low** |
| Orphan upload cleanup | None — server reaps unattached uploads after 24 h | — | — |

---

*Generated from `/docs` (esp. [`custom-delivery-special-orders.md`](./custom-delivery-special-orders.md)),
live controllers/DTOs, and the Prisma schema. Verify final payloads against Swagger (`/api/docs`)
with a real token before implementation. For everything prior to this addendum, see
[Part 1](./frontend-mobile-integration-changes.md).*
