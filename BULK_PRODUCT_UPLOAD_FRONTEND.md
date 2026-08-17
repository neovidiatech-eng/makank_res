# Bulk Product Upload — Frontend Integration Guide

تنشئ هذه الوثيقة دليلاً كاملاً لمطور الفرونت إند (Frontend Developer) لربط وتكامل ميزة **رفع المنتجات بالإكسيل (Bulk Upload)** وإدارة الأخطاء الخاصة بها.

---

## 1. الأند بوينتس المتاحة (Endpoints)

### أ. تحميل قالب الإكسيل (Download Template)
* **Endpoint**: `GET /api/services/bulk-upload/template`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`
* **Response**: ملف ثنائي بصيغة `.xlsx` باسم `products-template.xlsx`.
* **الاستخدام**: زِر "تحميل القالب" في الداشبورد لتحميل شيت إكسيل جاهز بالأعمدة والتعليمات.

---

### ب. رفع ملف المنتجات (Upload Products Excel)
* **Endpoint**: `POST /api/services/bulk-upload` (أو `POST /api/services/bulk-upload/upload`)
* **Headers**: 
  * `Authorization: Bearer <JWT_TOKEN>`
  * `Content-Type: multipart/form-data`

#### حقول الـ `FormData` المطلوب إرسالها:

| اسم الحقل (Key) | النوع (Type) | إجباري؟ | الوصف |
| :--- | :--- | :--- | :--- |
| `file` | File (`.xlsx`) | **نعم** | ملف الإكسيل المكتمل البيانات. **(يجب أن يكون المفتاح `file` حصراً)** |
| `storeId` | Number / String | **نعم للأدمن فقط** | رقم المتجر التابع له المنتجات (يتم اختيار متجر موجود بالفعل من القائمة المنسدلة). **(غير مطلوب لو كان الحساب المسجل حساب متجر Store Role)** |

---

## 2. هيكل الاستجابة التوضيحي (Response Specification)

عند النجاح ترجع الاستجابة كـ `200 OK` وتحتوي على تقرير تفصيلي بكل صف في شيت الإكسيل:

```json
{
  "statusCode": 200,
  "message": "bulk product upload processed",
  "data": {
    "totalRows": 5,
    "createdCount": 3,
    "failedCount": 2,
    "results": [
      {
        "row": 2,
        "productName": "عصير مانجو",
        "status": "created"
      },
      {
        "row": 3,
        "productName": "عصير برتقال",
        "status": "created"
      },
      {
        "row": 4,
        "productName": "ساندوتش برجر",
        "status": "failed",
        "reason": "السعر بعد الخصم لازم يكون أقل من السعر الأصلي"
      },
      {
        "row": 5,
        "productName": "عصير قصب",
        "status": "failed",
        "reason": "المتجر رقم (999) غير موجود في النظام"
      }
    ]
  }
}
```

---

## 3. طريقة عرض التقرير في الواجهة (UI Handling Requirements)

عند استلام النتيجة من الباك إند:

1. **عرض الملخص العلوي (Summary Header)**:
   * عدد الصفوف المعالجة: `totalRows`
   * تم إنشاؤها بنجاح: `createdCount` (Badge أخضر)
   * صفوف بها أخطاء: `failedCount` (Badge أحمر)

2. **عرض جدول / Modal التقرير التفصيلي (`results`)**:
   * **رقم الصف (`row`)**: يساعد المستخدم في معرفة مكان الخطأ في شيت الإكسيل لتعديله.
   * **اسم المنتج (`productName`)**.
   * **الحالة (`status`)**:
     * `created`: يظهر بعلامة صح (Success Badge).
     * `failed`: يظهر بعلامة خطأ (Danger Badge) ويتم إظهار سبب الفشل الفعلي الموجود في حقل **`reason`**.

---

## 4. تعليمات إضافية مهمة للفرونت إند (Best Practices)

1. **تنظيف معلمة الـ Query Params**:
   * عند إرسال أي طلبات فلترة (مثل طلب قائمة المتاجر أو المنتجات)، تأكد من عدم تحويل الحقول الفارغة إلى نصوص `"undefined"` أو `"null"`. يفضل حذف المفاتيح الفارغة من الـ Params Object قبل إرسال الـ Request.
2. **التحقق من اختيار المتجر للأدمن**:
   * يرجى تعطيل زر "رفع الملف" لو كان المستخدم أدمن حتى يتم اختيار المتجر المناسب أولاً ومنع إرسال `storeId` غير معرف أو فارغ.
