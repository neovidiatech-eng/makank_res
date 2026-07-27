# 📱 Mobile Notification & Campaigns Integration Guide

This guide details how the mobile client (Flutter/iOS/Android) should handle **Push Notifications (FCM)**, **Historical Notifications**, and **In-App Popup Offers (Campaigns)**, with a focus on click targets, deep-linking, and the custom delivery flows.

---

## 1️⃣ Push Notifications (FCM Payload)

When the backend sends manual admin notifications or automated updates, it dispatches an FCM payload containing a standard notification block and a custom metadata `data` block for deep-linking.

### FCM Payload Structure
```json
{
  "notification": {
    "title": "Title localized in user's language",
    "body": "Body text localized in user's language",
    "imageUrl": "https://api.makanak-app.com/uploads/campaigns/image.png" // Rich Notification Image (Optional)
  },
  "data": {
    "targetType": "SPECIAL_DRIVER",
    "deliveryId": "RESTAURANT"
  }
}
```

### Deep-Linking Actions (`data` Payload)

When the user taps a notification, read the `targetType` from the `data` payload and redirect the user accordingly:

| `targetType` | Redirect Destination | Required Parameters inside `data` |
|:---|:---|:---|
| `GENERAL` | Open App Home Screen | None |
| `STORE` | Open specific Restaurant/Store screen | `storeId` (Stringified ID) |
| `CATEGORY` | Open specific Category screen | `categoryId` (Stringified ID) |
| `SERVICE` | Open specific Product/Service details screen | `serviceId` (Stringified ID) |
| `ZONE` | Open a specific geographical zone | `zoneId` (Stringified ID) |
| `ORDER` | Open specific Order Details screen | `orderId` (Stringified ID) |
| `COUPON` | Open specific Coupon screen | `couponId` (Stringified ID) |
| `EXTERNAL_URL` | Open browser or WebView | `url` (String URL) |
| `SPECIAL_DRIVER` | Open **Custom Delivery** flows / Driver Profile | `deliveryId` (String / Stringified ID) |

---

### 🚨 Routing Logic for `SPECIAL_DRIVER` (Custom Delivery / المندوب الخاص)
 Tapping a notification targeting `SPECIAL_DRIVER` opens a specific screen based on the value of the `deliveryId` parameter:

1. **`deliveryId == "RESTAURANT"`**
   * **Action:** Redirect directly to the **Restaurant Custom Delivery screen** (مندوب مطاعم ومتاجر) where they fill in their pickup and drop-off stations.
2. **`deliveryId == "PURCHASE"`**
   * **Action:** Redirect directly to the **Purchase Custom Delivery screen** (مندوب مشتريات) to request a driver to buy items.
3. **`deliveryId == "ONLINE"`**
   * **Action:** Redirect directly to the **Online Delivery screen** (مندوب أونلاين / توصيل عادي) which opens the home category/stores listing.
4. **`deliveryId` is a Numeric Value (e.g., `"12"`)**
   * **Action:** Deep-link and open the **specific Driver's Profile screen** for the driver whose User ID matches the value.

---

## 2️⃣ Historical Notifications API

For displaying the customer's notification inbox page inside the app.

### 📥 1. Get Notification History
* **Endpoint:** `GET /api/notification/notifications`
* **Headers:** `Authorization: Bearer <token>`
* **Query Parameters (Optional Pagination):** `?page=1&limit=20`
* **Response Body (`data` is an array):**
```json
{
  "status": 200,
  "message": "notification fetched successfully",
  "data": [
    {
      "id": 14,
      "image": "uploads/admin-notifications/image.png",
      "title": { "ar": "عنوان الإشعار", "en": "Notification Title" },
      "body": { "ar": "محتوى الإشعار", "en": "Notification Body" },
      "read": true,
      "createdAt": "2026-07-18T12:00:00.000Z",
      "clickTargetType": "SPECIAL_DRIVER",
      "clickDeliveryId": "RESTAURANT",
      "clickStoreId": null,
      "clickCategoryId": null,
      "clickServiceId": null,
      "clickZoneId": null,
      "clickOrderId": null,
      "clickCouponId": null,
      "clickUrl": null
    }
  ],
  "total": 1
}
```
> ⚠️ **Note:** Unlike the push notification title/body which arrives pre-localized, the historical inbox API returns bilingual JSON objects `{ ar, en }` for the `title` and `body` fields. You must render the string corresponding to the user's selected language.

### ✔️ 2. Mark All Notifications as Read
* **Endpoint:** `PATCH /api/notification/mark-read`
* **Headers:** `Authorization: Bearer <token>`

### ✔️ 3. Mark a Specific Notification as Read
* **Endpoint:** `PATCH /api/notification/:id/mark-read`
* **Headers:** `Authorization: Bearer <token>`
* **URL Parameter:** `id` (Notification ID)

---

## 3️⃣ In-App Popup Offers (Campaigns) API

Offers (type `OFFER`) are full-screen or popup banner promotions shown to customers on app launch/resume. The backend automatically handles schedule windows, target audience filters, and frequency caps.

### 🎁 1. Fetch Active Popup Offers
* **Endpoint:** `GET /api/campaigns/active-offers`
* **Headers:** `Authorization: Bearer <token>`
* **Response Body (`data` is an array):**
```json
{
  "status": 200,
  "message": "Active offers fetched successfully",
  "data": [
    {
      "id": 3,
      "type": "OFFER",
      "title": { "ar": "خصم مميز", "en": "Special Offer" },
      "description": { "ar": "احصل على خصم 50%", "en": "Get 50% discount" },
      "image": "uploads/campaigns/offer.png",
      "targetType": "SPECIAL_DRIVER",
      "deliveryId": "RESTAURANT",
      "storeId": null,
      "serviceId": null,
      "Store": null,
      "Service": null
    }
  ]
}
```

* Tapping on a popup triggers deep-linking based on `targetType`:
  * `ALL` / `CUSTOMER`: General offer (no redirection, close the popup).
  * `STORE`: Open the store page. Deep-link using the details inside `Store` object (e.g. `Store.id`).
  * `SERVICE`: Open the product/service page. Deep-link using details inside `Service` object (e.g. `Service.id`).
  * `SPECIAL_DRIVER`: Open Custom Delivery. Read `deliveryId` (can be `"RESTAURANT"`, `"PURCHASE"`, `"ONLINE"`, or a numeric driver profile ID).

### 👁️ 2. Mark Popup Offer as Viewed
Call this endpoint as soon as a popup is displayed to the user. This updates the frequency cap on the backend so the user is not spammed on subsequent app launches.
* **Endpoint:** `POST /api/campaigns/:id/viewed`
* **Headers:** `Authorization: Bearer <token>`
* **URL Parameter:** `id` (Campaign ID)
