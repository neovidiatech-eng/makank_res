# إندبوينتس تصفح المطاعم والطلب — تطبيق العميل (الموبايل)

> مرجع كامل لكل الإندبوينتس اللي التطبيق محتاجها عشان العميل يتصفح المطاعم ويطلب منها — من اختيار المدينة/المنطقة لحد تقييم الطلب بعد التسليم. كل إندبوينت هنا موجود ومختبر بالفعل.

## هيدرز إجبارية على كل الريكوستس

أي ريكوست من غير الهيدرز دول بيرجع 400:
- `locale`: `ar` أو `en`
- `islocalized`: `true` أو `false`

الإندبوينتس اللي فيها `visitor: true` تحت تقدر تتنادى من غير تسجيل دخول خالص (زائر)، وتقدر تتنادى بعد تسجيل الدخول كمان (`Authorization: Bearer <AccessToken>`) — ساعتها بيرجع معلومات إضافية خاصة بالعميل (زي `isFavourite`).

---

## 1. المدن والمناطق (تحديد الموقع)

### `GET /cities`
**Auth:** Visitor (مفتوح)

قايمة المدن. مفيش فلتر خاص، بس `id` لجلب مدينة واحدة.

```json
{ "data": [ { "id": 1, "name": { "ar": "القاهرة", "en": "Cairo" } } ], "total": 10 }
```

### `GET /zones?cityId={id}`
**Auth:** Visitor (مفتوح)

مناطق مدينة معيّنة — العميل يختارها من قايمة منسدلة وقت تحديد عنوانه، بتساعد بس مش بديل عن تحديد نقطة على الخريطة.

**فلاتر:** `cityId`, `name` (بحث بالاسم), `active` (افتراضيًا بيرجع كل حاجة لو ملهاش قيمة).

```json
{
  "data": [
    { "id": 5, "name": { "ar": "مدينة نصر", "en": "Nasr City" }, "coordinates": [...], "active": true, "cityId": 1, "deliveryPrice": 25 }
  ],
  "total": 3
}
```

> **مهم:** `deliveryPrice` لو مش `null`، ده معناه إن الأدمن حدد سعر توصيل ثابت للمنطقة دي — بيتطبق تلقائي في السيرفر وقت حساب سعر التوصيل، العميل مش محتاج يبعته في أي حتة، هو بس بيبان كمعلومة للعرض لو حبيت.

---

## 2. عناوين العميل

### `GET /addresses`
**Auth:** Customer

عناوين العميل المحفوظة.

### `POST /addresses`
**Auth:** Customer

```json
{ "title": "البيت", "address": "شارع النصر، عمارة 5", "lat": 30.048, "lng": 31.238 }
```

### `PATCH /addresses/:id`
**Auth:** Customer — نفس حقول الإنشاء (كلها اختيارية) + `default: true` لجعله العنوان الافتراضي.

### `DELETE /addresses/:id`
**Auth:** Customer

---

## 3. تصفح المطاعم

### `GET /stores`
**Auth:** Visitor (مفتوح) — بيرجع بيانات إضافية (`isFavourite`) لو العميل مسجّل دخول.

**أهم الفلاتر:**

| الفلتر | النوع | الوصف |
|---|---|---|
| `lat`, `lng` | number | لو اتبعتوا، النتائج بترجع مرتبة بالأقرب أولًا (يحتاج `storeNearestByKM` setting) |
| `cityId` | number | مطاعم مدينة معيّنة |
| `categoryId` | number | مطاعم فيها فئة معيّنة |
| `name` | string | بحث بالاسم |
| `hasOffers` | boolean | بس المطاعم اللي عندها عروض (Bundles) شغالة دلوقتي |
| `minRating` | number | تقييم أعلى من كذا |
| `freeDelivery` | boolean | بس المطاعم اللي بتوصّل ببلاش |
| `price` | `{min, max}` | فلترة بسعر المنتجات |
| `closed`, `temporarilyClosed` | boolean | حالة الفرع |
| `templateCategoryId`, `templateId` | number | فلترة بقالب أدمن معيّن |
| `favouriteCustomerId` | number | مطاعم العميل المفضلة (بيتحط تلقائي لو العميل مسجّل واستخدم `PATCH /stores/favourite`) |

**الرد (مختصر):**

```json
{
  "data": [
    {
      "id": 1,
      "name": { "ar": "مطعم الاختبار", "en": "Test Restaurant" },
      "logo": "uploads/...", "cover": "uploads/...",
      "freeDelivery": false, "isVerified": true, "isBlocked": false,
      "commission": 10, "commissionType": "PERCENTAGE",
      "storeOrder": 1,
      "Services": [ /* أفضل كام منتج، للعرض السريع */ ],
      "branches": [ { "id": 1, "address": "...", "lat": 30.05, "lng": 31.24, "rating": 5, "storeSchedule": [...] } ],
      "StoreCoupons": [ /* كوبونات سارية */ ]
    }
  ],
  "total": 40
}
```

### `GET /stores/:id`
**Auth:** Visitor — نفس الشكل فوق، عنصر واحد.

### `GET /stores/:id/products`
**Auth:** Visitor

منتجات المطعم **مجمّعة حسب الفئة** — الشكل اللي شاشة "قايمة المطعم" محتاجاه مباشرة (مش لازم تنادي `GET /services` لوحدها وتجمّعها انت).

### `PATCH /stores/favourite/:id`
**Auth:** Customer — إضافة/شيل مطعم من مفضلة العميل (toggle، نفس الإندبوينت للإضافة والشيل).

### `GET /stores/favourite`
**Auth:** Customer — مطاعم العميل المفضلة.

---

## 4. الفئات (Categories)

### `GET /categories`
**Auth:** Visitor

فئات المطاعم/المنتجات — تستخدمها لبناء فلتر `categoryId` فوق.

---

## 5. المنتجات (Services) لوحدها

### `GET /services`
**Auth:** Visitor

**فلاتر مهمة:** `storeId` (منتجات مطعم معيّن)، `categoryId`، `name`/`description` (بحث)، `bestRated`، `mostSeller`، `available`.

### `GET /services/:id`
**Auth:** Visitor

تفاصيل منتج واحد كاملة — بالأحجام (`Sizes`) والإضافات (`Addons`):

```json
{
  "id": 1,
  "name": { "ar": "برجر كلاسيك", "en": "Classic Burger" },
  "description": { "ar": "...", "en": "..." },
  "image": "uploads/...",
  "price": 75,
  "priceAfterDiscount": 60,
  "effectivePrice": 60,
  "hasDiscount": true,
  "Sizes": [
    { "id": 1, "name": { "ar": "صغير", "en": "Small" }, "price": 60, "priceAfterDiscount": null, "isDefault": true },
    { "id": 2, "name": { "ar": "كبير", "en": "Large" }, "price": 90, "priceAfterDiscount": 72 }
  ],
  "Addons": [ { "id": 1, "name": { "ar": "جبنة إضافية", "en": "Extra Cheese" }, "price": 10 } ],
  "Category": { "id": 1, "name": {...} },
  "Store": { "id": 1, "name": {...}, "branches": [...] },
  "rating": 4.5, "review": 12
}
```

> **مهم للسلة/الحساب:** لو المنتج عنده `Sizes`، العميل ممكن يطلب من غير ما يختار حجم خالص (`sizeId` اختياري) — في الحالة دي السعر بياخد `priceAfterDiscount`/`price` بتاع المنتج نفسه (مش أي حجم). لو اختار حجم، السعر بياخد خصم الحجم ده بالتحديد. الخصمين مستقلين عن بعض تمامًا.

### `PATCH /services/favourite/:id`
**Auth:** Customer — toggle مفضلة.

### `GET /services/favourite`
**Auth:** Customer

---

## 6. عروض وكوبونات وبانرات

### `GET /bundles?storeId={id}`
**Auth:** Visitor — **لازم تبعت `storeId` أو `id` عرض واحد**، وإلا بيرجع 400 (مقصود، مش باگ — عشان محدش يشوف "كل عروض المنصة" دفعة واحدة بالغلط).

### `GET /coupons`
**Auth:** Visitor — الكوبونات المتاحة. فلاتر: `code`, `title`, `type`, `discountType`.

### `GET /banners`
**Auth:** Visitor — البانرات (فلتر: `storeId`, `categoryId`, `serviceId`, `targetType`).

### `POST /banners/:id/click`
**Auth:** Visitor — تسجيل ضغطة على بانر (للإحصائيات فقط).

---

## 7. حساب السعر والطلب

### `POST /orders/calculate/order`
**Auth:** Customer

معاينة السعر قبل التأكيد — **نفس Body بتاع الإنشاء تحت، من غير `paymentMethod`**. بيرجع تفاصيل السعر (شحن، خصم، عمولة، الإجمالي) من غير ما يعمل أوردر فعلي.

### `POST /orders`
**Auth:** Customer

```json
{
  "branchId": 1,
  "addressId": 1,
  "zoneId": 5,
  "items": [
    { "serviceId": 1, "sizeId": 2, "addonIds": [1], "quantity": 2 }
  ],
  "bundleSelections": [
    { "bundleId": 3, "paidItems": [{ "serviceId": 1, "quantity": 1 }], "freeItems": [{ "serviceId": 2, "quantity": 1 }] }
  ],
  "couponCode": "WELCOME10",
  "tip": 5,
  "type": "DELIVERY",
  "paymentMethod": "CASH",
  "paidWithWallet": false,
  "isGift": false,
  "note": "من غير بصل",
  "scheduledAt": null,
  "fortuneRewardId": null
}
```

**الحقول:**

| الحقل | مطلوب؟ | الوصف |
|---|---|---|
| `branchId` | ✅ | فرع المطعم |
| `addressId` | اختياري | عنوان التوصيل (لازم لو `type: DELIVERY`) |
| `zoneId` | اختياري | **مرجعي بس** — المنطقة اللي العميل اختارها من القايمة المنسدلة، مش بتأثر على السعر خالص (السعر دايمًا من العنوان الحقيقي) |
| `items` | اختياري | منتجات عادية — `sizeId`/`addonIds` اختياريين |
| `bundleSelections` | اختياري | عروض (Bundles) مطبّقة |
| `couponCode` | اختياري | كود خصم |
| `tip` | اختياري | إكرامية |
| `type` | اختياري | `DELIVERY` (افتراضي) أو `PICKUP` (لو الخاصية مفعّلة) |
| `paymentMethod` | ✅ (وقت الإنشاء بس) | `CASH` أو `WALLET` |
| `paidWithWallet` | اختياري | يدفع من محفظته الداخلية (رصيده جوه التطبيق) |
| `transferNumber` / `transferType` / `transferAccountNumber` / `transferImage` | مطلوبين لو `paymentMethod: WALLET` | فودافون كاش/إنستاباي (رقم موبايل) أو تحويل بنكي (رقم حساب) + صورة إيصال |
| `isGift` | اختياري | طلب كهدية |
| `scheduledAt` + `category: "SCHEDULED"` | اختياري | جدولة الطلب لوقت لاحق |

**ملاحظات فلو مهمة:**
- `paymentMethod: CASH` → الطلب يبدأ `PENDING`، المطعم ياخد إشعار فورًا.
- `paymentMethod: WALLET` (تحويل + صورة إيصال) → الطلب يبدأ `PENDING_PAYMENT`، **المطعم لسه ماشافوش**، لحد ما الأدمن/المطعم يوافق على الصورة (`PATCH /orders/:id/verify-payment`)، وقتها بس يتحول لحالة عادية ويوصل إشعار للمطعم.
- تعيين المندوب مبيبدأش إلا بعد ما المطعم يقبل الطلب (مش وقت الإنشاء).

### `GET /orders`
**Auth:** Customer — طلبات العميل (بتتفلتر تلقائي بيه هو بس، مش محتاج تبعت `userId`).

**فلاتر:** `status`, `type`, `current` (الطلبات الجارية، مش `DELIVERED`/`CANCELLED`), `past` (المكتملة).

### `GET /orders/:id`
**Auth:** Customer

### `GET /orders/:id/tracking`
**Auth:** Customer — تتبع لايف: حالة الطلب + موقع المندوب الحالي (لو معيّن).

### `PATCH /orders/:id/verify-payment`
**Auth:** Customer (بيرفع صورة إثبات الدفع لو نسي وقت الإنشاء) — أو المطعم/الأدمن (اللي بيوافق/يرفض فعليًا).

### `POST /orders/:id/reorder`
**Auth:** Customer

```json
{ "paymentMethod": "CASH", "paidWithWallet": false, "addressId": 1 }
```

بيعمل أوردر جديد من عناصر أوردر قديم، **لكن بيتحسب بالسعر الحالي** مش السعر وقت الطلب الأول (لو المنتج غيّر سعره).

### `POST /orders/:id/rate`
**Auth:** Customer — بعد ما الطلب يوصل (`DELIVERED`) بس.

```json
{ "storeRate": 5, "storeComment": "ممتاز", "deliveryRate": 4, "deliveryComment": "سريع" }
```

كل الحقول اختيارية، لكن لازم واحد على الأقل (تقييم المطعم أو المندوب).

---

## ملخص سريع — ترتيب الفلو المتوقع في التطبيق

1. `GET /cities` → العميل يختار مدينته.
2. `GET /zones?cityId=` (اختياري، بس لعرض/مساعدة) + `POST /addresses` أو اختيار عنوان محفوظ.
3. `GET /stores?lat=&lng=` أو `?cityId=` → قايمة المطاعم.
4. `GET /stores/:id/products` → قايمة منتجات المطعم.
5. `GET /services/:id` → تفاصيل منتج (لو محتاج تفاصيل أكتر قبل الإضافة للسلة).
6. `POST /orders/calculate/order` → معاينة السعر بعد ما العميل يبني سلته.
7. `POST /orders` → تأكيد الطلب.
8. `GET /orders/:id/tracking` → متابعة الطلب لحد التسليم.
9. `POST /orders/:id/rate` → تقييم بعد التسليم.
