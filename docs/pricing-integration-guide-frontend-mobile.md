# Pricing & Commission — Frontend / Mobile Integration Guide

What changed, what fields you now receive, and exactly what you must update.
Backend internals are in `pricing-and-commission-analysis.md`; this doc is the client-facing view only.

---

## TL;DR — What Changed and What You Must Do

| # | Change | Action required |
|---|---|---|
| 1 | Service responses now include `priceAfterDiscount`, `effectivePrice`, `hasDiscount` | Use `effectivePrice` as the display/cart price; show strikethrough on sale |
| 2 | Each size now has the same discount fields | Show sale prices per size; use `size.effectivePrice` when a size is selected |
| 3 | `priceWithDefaultOptions` now reflects the **default size's discounted price** | Use this as the headline on service list cards |
| 4 | Order responses now expose `globalCommission` and `storeCommission` | Add a "Platform fee" line to the receipt |
| 5 | All prices from the API are already commission-inclusive | Never add commission on the client |

---

## 1. Service List Card

### New fields on every service object

```json
{
  "price": 165,
  "priceAfterDiscount": 132,
  "effectivePrice": 132,
  "hasDiscount": true,
  "priceWithDefaultOptions": 132,
  "commission": 10,
  "commissionType": "PERCENTAGE"
}
```

| Field | Type | What it is |
|---|---|---|
| `price` | `number` | Original price, commission-inclusive. Always present. |
| `priceAfterDiscount` | `number \| null` | Discounted price, commission-inclusive. `null` = not on sale. |
| `effectivePrice` | `number` | **What to display and charge.** = `priceAfterDiscount` when on sale, else = `price`. |
| `hasDiscount` | `boolean` | `true` = item is currently on sale. |
| `priceWithDefaultOptions` | `number` | Effective price for the **default size** (or base if no sizes). Use as the card headline. |
| `commission` | `number` | Store commission value — informational, already baked into `price`. |
| `commissionType` | `"PERCENTAGE" \| "FIXED"` | Commission mode — informational only. |

### Display rule

```
// list card headline
headline = priceWithDefaultOptions

if (hasDiscount) {
  show:  ~~price~~  effectivePrice   + sale badge
} else {
  show:  effectivePrice
}
```

---

## 2. Service Detail / Size Selector

### New fields on each size in `Sizes[]`

```json
{
  "Sizes": [
    {
      "id": "...",
      "name": "Small",
      "price": 110,
      "priceAfterDiscount": null,
      "effectivePrice": 110,
      "hasDiscount": false
    },
    {
      "id": "...",
      "name": "Large",
      "price": 165,
      "priceAfterDiscount": 132,
      "effectivePrice": 132,
      "hasDiscount": true
    }
  ]
}
```

Same rule per size option:
- Display `effectivePrice` as the active payable price.
- Show `price` struck through when `hasDiscount` is `true`.
- When the user selects a size: **cart unit price = `size.effectivePrice`**.

### Client-side cart preview (display only)

```
selectedPrice = selectedSize ? selectedSize.effectivePrice : service.effectivePrice
unitDisplay   = selectedPrice + sum(addon.price for each selected addon)
lineDisplay   = unitDisplay × quantity
```

> The server recalculates the real total on order creation — these figures are for UI feedback only.
> Never submit pre-computed totals.

---

## 3. Add-ons

Add-on prices are **never discounted** and have no commission applied. Display the raw value:

```json
{ "id": "...", "name": "Extra cheese", "price": 10 }
```

---

## 4. Order Receipt / Invoice

Two new breakdown fields appear on every order. Your receipt screen should show them.

### Order response fields

```json
{
  "price": 1100,
  "globalCommission": 22,
  "storeCommission": 100,
  "adminCommission": 122,
  "shipping": 50,
  "tax": 0,
  "discountAmount": 0,
  "totalPriceAfterDiscount": 1172
}
```

| Field | What it is |
|---|---|
| `price` | Items subtotal — store commission already inside, global excluded |
| `globalCommission` | Platform fee added on top of the subtotal |
| `storeCommission` | Store markup baked into `price` — informational |
| `adminCommission` | `globalCommission + storeCommission` — total platform revenue — informational |
| `shipping` | Delivery fee |
| `tax` | Tax amount |
| `discountAmount` | Coupon + reward discount |
| `totalPriceAfterDiscount` | **Final amount the customer pays** |

### Recommended receipt layout

```
Items subtotal          price
Delivery                shipping
Tax                     tax
Platform fee            globalCommission
Discount               −discountAmount
─────────────────────────────────────────
Total                   totalPriceAfterDiscount
```

> `storeCommission` and `adminCommission` are internal — you may hide them from the customer view.

### Verification formula

```
totalPriceAfterDiscount = max(0, price − discountAmount) + tax + shipping + globalCommission
```

Use this to validate that your UI renders the right total.

### Custom delivery orders

Same fields. `storeCommission` is always `0`. The invoice summary also exposes `extraStopFee`
(charged per stop beyond the first two) — show it as a separate line item.

---

## 5. Sending Prices to the Server

You do **not** send prices. The order creation payload carries item IDs only:

```json
{
  "serviceId": "...",
  "sizeId": "...",
  "addonIds": ["..."],
  "quantity": 2
}
```

The server resolves and validates the price from the database. Never include a `price` or `total`
field in the order request.

---

## 6. Admin / Store Dashboard — Commission Config

If you display commission configuration on a dashboard:

**Per-store commission** — `PATCH /stores/:id/commission`:
```json
{ "commission": 10, "commissionType": "PERCENTAGE" }
```
- `commissionType`: `"PERCENTAGE"` or `"FIXED"`.
- `PERCENTAGE` is capped at 100. `FIXED` has no cap.

**Global commission** — `PATCH /settings`:
```json
{
  "businessOrderCommissionRateForAll": true,
  "businessOrderCommissionRate": 2,
  "businessOrderCommissionType": "PERCENTAGE"
}
```
- `businessOrderCommissionRateForAll`: `true` = global commission enabled.
- `businessOrderCommissionRate`: the value (percentage or fixed amount).
- `businessOrderCommissionType`: `"PERCENTAGE"` or `"FIXED"`.

---

## 7. Admin — Create / Edit Service (Sale Prices)

`priceAfterDiscount` is optional on both a service and each size:

| Intent | What to send |
|---|---|
| Not on sale | Omit the field, or send `null` |
| Put on sale | Send a number: must be `>= 0` and `< price` |
| Remove a service sale (PATCH) | Explicitly send `"priceAfterDiscount": null` |
| Remove a size sale | Omit `priceAfterDiscount` when re-submitting sizes (sizes are recreated on every update) |

The server rejects values `>= price` or `< 0` with a validation error.

---

## 8. Price Display Quick Reference

| Context | Field to use |
|---|---|
| Service list card headline | `priceWithDefaultOptions` |
| Service detail (no size) | `effectivePrice` |
| Size option button | `size.effectivePrice` |
| Add-on | `addon.price` |
| Cart line total (display) | `effectivePrice × quantity + addons` |
| Order total | `totalPriceAfterDiscount` |
| Receipt platform fee line | `globalCommission` |

---

## 9. Checklist

- [ ] Service list cards show `priceWithDefaultOptions` as the headline
- [ ] Sale badge / strikethrough shown when `hasDiscount: true`
- [ ] Service detail shows `effectivePrice` as the active price
- [ ] Each size option shows `effectivePrice`, with `price` struck through when `hasDiscount: true`
- [ ] Cart unit price updates to `size.effectivePrice` when a size is selected
- [ ] Add-ons display their raw `price` (no discount, no commission modifier)
- [ ] Order receipt includes a "Platform fee" line from `globalCommission`
- [ ] Order total displays `totalPriceAfterDiscount`
- [ ] No client-side commission calculation — all API prices are final
- [ ] Order payload contains item IDs only, never a price field

---

## 10. Display Examples

### Service with 10% store commission, on sale

```
Backend:  service.price = 150, service.priceAfterDiscount = 120, store 10%
Response: price = 165, priceAfterDiscount = 132, effectivePrice = 132, hasDiscount = true

Display:
  ~~165 EGP~~  →  132 EGP  🏷 Sale
Cart unit price: 132 EGP
```

### Service with no discount

```
Response: price = 165, priceAfterDiscount = null, effectivePrice = 165, hasDiscount = false

Display:
  165 EGP
```

### Order receipt breakdown

```
Items subtotal       1 100 EGP
Delivery                50 EGP
Platform fee            22 EGP
─────────────────────────────
Total               1 172 EGP
```
