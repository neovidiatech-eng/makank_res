# Schedule Times — Frontend / Mobile Integration Guide

Everything a client (customer app, driver app, store-owner dashboard) needs to **read and write**
store/branch hours and driver shift times.

> **The whole contract:** schedule times are a plain **Egypt (Africa/Cairo) wall-clock `"HH:mm"`
> string**, in **both** directions. You send `"09:00"`, the backend stores `09:00`, and it returns
> `"09:00"`. **No timezone conversion, no ISO instants, no offset math, no `+3h` correction.**

Backend rationale and the helper live in **[timezone-handling.md](./timezone-handling.md)**. The
end-to-end QA procedure is **[timezone-manual-test-flow.md](./timezone-manual-test-flow.md)**.

---

## Endpoints at a glance

All paths use the global prefix `/api` (server on `:3030`, Swagger at `/api/docs`).

| Surface | Method & path | Body / params | Time fields |
|---|---|---|---|
| Create store/branch schedule | `POST /api/schedule` | `CreateScheduleDTO` (`openingTime`, `closingTime`, `day`, `branchId?`) | `"HH:mm"` |
| Delete store/branch schedule | `DELETE /api/schedule/:id` | schedule id | — |
| Bulk update store schedules | `PUT /api/schedule/bulk` | `UpdateStoreScheduleDTO` (`schedules[]`) | `"HH:mm"` |
| Get store available days | `GET /api/schedule/:id` | store/branch id | returns `"HH:mm"` |
| Get schedule for a date | `GET /api/schedule/:id/:date` | id + date | all time fields as `"HH:mm"` (`openingClosingTimes`, `slots.from`, `slots.to`) |
| Create driver schedule | `POST /api/deliveryData/schedule` | `CreateDeliveryScheduleDTO` (`openingTime`, `closingTime`, `day`, `deliveryId?`) | `"HH:mm"` |
| Delete driver schedule | `DELETE /api/deliveryData/schedule/:id` | schedule id | — |
| List driver schedules | `GET /api/deliveryData/schedule` | — | returns `"HH:mm"` |
| Driver check-in | `POST /api/deliveryData/schedule/:id/check-in` | `{ lat, lng }` | gated to the shift window |
| Branch / store "open now" | any branch/store GET | — | server-computed `isOpen` flag |
| Driver availability | driver GET | — | server-computed `isOnShift` flag |

---

## Writing schedule times

Send `openingTime` / `closingTime` as a **24-hour `"HH:mm"` string** — exactly what the time picker
shows the user, in Egypt local time. That's it.

```jsonc
// POST /api/schedule
{
  "day": "MONDAY",
  "openingTime": "09:00",
  "closingTime": "17:00",
  "branchId": 12
}
```

**Validation** (`HH:mm`, 24-hour, zero-padded — regex `^([01]\d|2[0-3]):([0-5]\d)$`):

| Valid | Invalid |
|---|---|
| `09:00`, `17:30`, `22:15`, `00:05`, `23:59` | `9:00` (not padded), `25:00` (hour > 23), `09:60` (min > 59), `2026-01-01T09:00:00Z` (ISO instant) |

Whatever your picker produces, format it to `HH:mm` before sending — e.g. JS
`` `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` ``, Dart
`'${h.toString().padLeft(2,'0')}:${m.toString().padLeft(2,'0')}'`, Swift
`String(format: "%02d:%02d", h, m)`, Kotlin `"%02d:%02d".format(h, m)`. **Do not** build a `Date`,
apply a timezone, or call `toISOString()`.

---

## Reading schedule times

Schedule responses return `openingTime` / `closingTime` as `"HH:mm"` **strings** — display them
directly. This holds on **every** surface: mobile (localized) **and** admin (raw) responses both get
`"09:00"`. No `1970-…Z`, no `+3h` to undo.

```jsonc
// GET /api/schedule/:id  →
[{ "id": 5, "day": "MONDAY", "openingTime": "09:00", "closingTime": "17:00", "branchId": 12 }]
```

This also applies to schedules **embedded** in other responses (e.g. `branch.storeSchedule`,
`store.branches[].storeSchedule`, a driver's `DeliveryDetails.Schedule`, and `getServiceSchedule`'s
`openingClosingTimes`).

> **`GET /api/schedule/:id/:date` slot fields:** that endpoint returns an additional
> `slots` array alongside `openingClosingTimes`. Both use `"HH:mm"` — no special handling needed:
> ```jsonc
> {
>   "day": "MONDAY",
>   "openingClosingTimes": [{ "openingTime": "09:00", "closingTime": "17:00" }],
>   "slots": [
>     { "from": "09:00", "to": "10:00", "status": "AVAILABLE" },
>     { "from": "10:00", "to": "11:00", "status": "BOOKED" }
>   ]
> }
> ```

> **Note on other timestamps (unchanged):** the global response serializer still adds a flat **+3h**
> to genuine `DateTime` instants (`createdAt`, `updatedAt`, order dates, …) on **localized** mobile
> responses, returning them as ISO strings. That is a separate, pre-existing concern and is **not**
> applied to schedule `HH:mm` fields. If you render those other timestamps, keep handling them as
> you do today; schedule times need no special handling anymore.

---

## Consuming "open / available" — trust the server

`isOpen` (branch/store) and `isOnShift` (driver) are computed **server-side** in Cairo time,
DST-correct, with the precedence rules in
[Worked examples](./timezone-handling.md#worked-examples). **Display them directly — do not recompute
open/closed on the client** from the schedule times.

---

## Driver check-in

`POST /api/deliveryData/schedule/:id/check-in` with `{ lat, lng }`. The backend validates against
**Cairo now** and returns `409 Conflict` (or `404`) with one of these messages — surface them to the
driver:

| Condition | Status | Message |
|---|---|---|
| On AFK break | 409 | `You are on a break until <time>` |
| Already online | 409 | `You are already checked in` |
| Wrong day | 409 | `Today is <DAY>, but this schedule is for <DAY>` |
| Before the window | 409 | `The shift has not started yet` |
| After the window | 409 | `The shift has already ended` |
| Outside required radius | 409 | `You are too far from the required location. Distance: …m, allowed: …m` |
| Schedule missing / not theirs | 404 | `Schedule not found for this delivery person` |

---

## Request headers

| Header | Values | Effect |
|---|---|---|
| `locale` | `ar` / `en` / `admin` | message language; `admin` returns raw (un-localized) bodies |
| `islocalized` | `true` / `false` | `true` ⇒ run the localizer (`+3h` on non-schedule `Date` fields, `{ar,en}` collapsing). **This header is required** — omitting it or sending any other value causes a `400 Bad Request`. |

Neither header affects schedule `HH:mm` fields — they are always `"HH:mm"`.

---

## Integration cheat sheet

- **Write:** send `"HH:mm"` (24-hour, zero-padded). No `Date`, no timezone, no ISO.
- **Read:** schedule fields come back as `"HH:mm"` — display as-is, on mobile and admin alike.
- **Open/closed:** use server `isOpen` (branch/store) / `isOnShift` (driver); don't recompute on the client.
- **Overnight schedules (`22:00→02:00`):** the runtime open-check handles overnight windows
  correctly, but the **create-time validator rejects any entry where `closingTime ≤ openingTime`**
  with `400 INVALID_SCHEDULE`. If your UI has a time picker that allows overnight spans, you must
  either block that selection or split it into two same-day entries before submitting. Do not
  assume the server will accept it — it will not (see the
  [manual test flow](./timezone-manual-test-flow.md)).
- **Other timestamps** (createdAt, order dates): unchanged — still subject to the `+3h` localizer.

---

## See also

- **[timezone-handling.md](./timezone-handling.md)** — the rule, the helper API, backend read/write
  paths, DST handling, and the (still-un-applied, gated) legacy-data migration.
- **[timezone-manual-test-flow.md](./timezone-manual-test-flow.md)** — step-by-step QA, including
  overnight windows and exact boundary cases.
