# Notification & Campaign System Documentation

## Overview
This document summarizes the final notification architecture after:
1. Campaigns (Notifications & Offers) feature implementation
2. Legacy notification security cleanup
3. Notification under-delivery fixes

## 1. Campaigns Module

### NOTIFICATION
Create Campaign (admin, requires `campaigns` permission)
→ Guard: if sentAt already set → skip (no double-send)
→ Resolve Recipients (CUSTOMER-only, see below)
→ If 0 recipients → persist campaign, report 0, do NOT stamp sentAt
→ Chunked dispatch (50/chunk, Promise.allSettled)
→ sendLocalizedNotification → in-app row + push (per recipient)
→ sentAt = now (only after a real send pass)

Dispatch happens **only on creation**. Editing or toggling status never re-sends.

**Campaign recipient resolution (always CUSTOMER-only):**
- base filter: `roleKey = 'Customer'`, `active = true`, `deletedAt = null`, `allowNotification = true`
- `targetType` ALL / CUSTOMER / STORE / SERVICE → every eligible customer
- `targetType` SELECTED_USERS → `targetUserIds` **intersected with** the customer base filter (non-customer IDs dropped)
- `storeId` / `serviceId` are **display/deep-link metadata only** — they never narrow the audience in v1.

> Note: a campaign's `ALL` means "all customers", NOT all roles. This differs from
> AdminNotificationService `ALL` (§5), which spans every role.

### OFFER
Create Campaign
→ No Push Notification (ever)
→ Available through active-offers endpoint
→ Displayed as Popup

## 2. Offer Popup Flow

GET /campaigns/active-offers   (CUSTOMER token only — non-customers get 403)
POST /campaigns/:id/viewed     (CUSTOMER token only)

Eligibility:
- type = OFFER
- manualStatus = ACTIVE
- startAt is null OR startAt <= now
- endAt is null OR endAt >= now
- not deleted
- targeting match: SELECTED_USERS → only listed customers; all other types → every customer
- due per frequency (below)

Response: omits `targetUserIds` and internal view rows.

Frequency (per-user, tracked in CampaignView):
displayIntervalHours ?? 24

Meaning:
- null => 24 hours
- 0 => always show
- N => every N hours

Flow:
Customer opens app
→ GET active-offers
→ Eligibility check
→ Popup
→ POST viewed
→ Cooldown

## 3. Audience Leakage Fix

Old:
undefined userId
→ dropped Prisma filter
→ all sessions
→ broadcast

Now:
if (!userId) return;

## 4. Admin Notification Security

Before:
POST /admin-notifications
without auth

After:
@Auth({ prefix: "admin-notifications" })

Added:
- Permission
- Admin grant
- Seed support

## 5. Target Types (AdminNotificationService — multi-role)

> These are the AdminNotificationService target types (POST /admin-notifications).
> They are NOT the campaign target types (campaigns are always customer-only, §1).
> `ALL` is never the implicit default — an admin must choose it explicitly; a
> missing targetType falls back to CUSTOMER.

Safety filters applied to EVERY type: `active=true`, `deletedAt=null`, `allowNotification=true`.

ALL:
- Every role (global announcement) + safety filters

CUSTOMER:
roleKey=Customer

DELIVERY:
roleKey=Delivery

STORE:
roleKey=Store
(optionally narrowed to storeIds passed in targetUserIds)

SELECTED_USERS:
Selected IDs only
+ safety filters
(no role constraint — the DTO carries no role; sends to exactly the chosen
 active, opted-in users regardless of role)

## 5.1 Admin Notification Click Targets

Manual admin notifications can include a click destination separate from the
audience `targetType`. The destination is stored on both `AdminNotification`
history rows and per-user `Notification` rows, and it is included in the FCM
`data` payload for tap-through routing.

FCM `data` keys mirror the banner routing contract:
- `GENERAL`: no click keys
- `STORE`: `{ "targetType": "STORE", "storeId": "123" }`
- `CATEGORY`: `{ "targetType": "CATEGORY", "storeId": "123", "categoryId": "45" }`
  (`storeId` is derived from the category and omitted only for store-less
  template/global categories)
- `SERVICE`: `{ "targetType": "SERVICE", "storeId": "123", "serviceId": "45" }`
  (`storeId` is derived from the service, which always belongs to a store)
- `ZONE`: `{ "targetType": "ZONE", "zoneId": "123" }`
- `SPECIAL_DRIVER`: `{ "targetType": "SPECIAL_DRIVER" }`
- `ORDER`: `{ "targetType": "ORDER", "orderId": "123" }`
- `COUPON`: `{ "targetType": "COUPON", "couponId": "123" }`
- `EXTERNAL_URL`: `{ "targetType": "EXTERNAL_URL", "url": "https://example.com" }`

All ID values in FCM `data` are strings, as required by Firebase.

## 6. Dispatch Improvements

Before:
Promise.all(allUsers)

After:
Chunked dispatch
Chunk size 50
Promise.allSettled()

Benefits:
- Failure isolation
- Better scalability
- Success/failure counts

## 7. FCM Security

Removed:
- console.log(tokens)
- console.log(message)

Only aggregate counts logged.

## 8. Localization

Fallback:
Requested locale
→ Arabic
→ English
→ First available
→ Empty string

## 9. Coupon Fixes

Old:
roleKey='CUSTOMER'

DB:
roleKey='Customer'

Result:
0 recipients

New:
RolesKeys.CUSTOMER

Also:
- After transaction commit
- Chunked dispatch
- allowNotification respected

## 10. Admin Timeout Fix

Old:
roleKey='ADMIN'

DB:
roleKey='Admin'

New:
RolesKeys.ADMIN

## 11. Final Flows

Customer:
Order Event
→ customerId
→ sendLocalizedNotification
→ Push
→ In-App

Driver:
Assignment
→ deliveryId
→ Push + In-App

Admin Broadcast:
Admin
→ POST admin-notifications
→ Auth
→ Resolve Recipients
→ Chunked Dispatch
→ Push + In-App

Offer:
Customer opens app
→ active-offers
→ CampaignView
→ Popup
→ viewed
→ cooldown

## 12. Permissions & Security

Admin routes (permission + role grant + seed required):
- `campaigns` → POST/GET/PATCH/DELETE  (Campaign admin CRUD + status)
- `admin-notifications` → POST/GET/DELETE  (manual admin notifications)

Customer routes:
- `GET /campaigns/active-offers`, `POST /campaigns/:id/viewed` — any ACCESS token,
  but the service enforces `roleKey = Customer` (403 otherwise).

Preserved safety mechanisms (do NOT regress):
- `sendLocalizedNotification` falsy-userId guard.
- jwt.service FCM token hygiene (token detached from all sessions on login).
- ACCESS-session-only token lookup + token de-duplication (Set).
- In-app notification row is always created, even when the user has no FCM token.

## Known Decisions

- `displayIntervalHours` null ⇒ 24h cap (0 ⇒ always show; N ⇒ every N hours).
- OFFER campaigns NEVER send push notifications.
- Campaign notifications are a separate concern from offer popups.
- Campaign audience is ALWAYS customers only (even targetType ALL/STORE/SERVICE).
- STORE/SERVICE on a campaign are display/deep-link metadata, not audience filters.
- AdminNotificationService `ALL` = every role, but must be chosen explicitly (never default).
- Marketing / promotional notifications (campaigns, admin, coupons) respect `allowNotification`.
- Operational/system alerts may bypass `allowNotification` — e.g. the delivery-timeout
  admin alert (`timer.service.ts`) intentionally does not filter on opt-out.
- Bulk dispatch uses bounded chunking (50/chunk, `Promise.allSettled`); `Promise.all`
  over all users is forbidden.
- Notification dispatch runs AFTER DB transactions commit (coupons), never inside them.

## Known Limitations

- Campaign geo-targeting by customer city/zone is NOT supported (no customer→zone link);
  v1 targeting is ALL/CUSTOMER/SELECTED_USERS only. STORE/SERVICE are metadata.
- Affinity targeting (favorites / order history) is intentionally out of scope.
- `NotificationMiddleware` is currently inert (send block commented out) and the Bull
  `notification` / `notificationQueue` is unused / inconsistent — not safe to reuse as-is.
- Large NOTIFICATION fan-out is dispatched inline (chunked) within the request, not via a
  background queue.
- Per-user FCM failures are counted and logged, but dead tokens are not pruned.

## Notification Safety Guarantees

1. No call sends to an undefined/null userId (guard + DB-sourced IDs only).
2. No promotional path reaches inactive, soft-deleted, or opted-out users.
3. Campaign notifications can never reach non-customers (drivers/admins/stores).
4. A single-recipient notification can never become a broadcast.
5. NOTIFICATION campaigns are never dispatched twice (sentAt guard).
6. FCM tokens and push payloads are never logged.
7. Title/body are never sent as undefined (localization fallback chain).
8. One failed recipient never aborts a batch.

## Production QA Checklist

- Customer notification
- Driver notification
- Store notification
- ALL notification (admin — all roles)
- SELECTED_USERS
- Coupon notification (create + update)
- Delivery-timeout admin alert
- Campaign notification (customer-only)
- Offer popup + viewed cooldown
- allowNotification respected (promotional) / bypassed (operational)
- inactive/deleted users excluded
- localization fallback
- Firebase delivery

Status:
Leakage-safe and ready for production QA, subject to the Known Limitations above.
