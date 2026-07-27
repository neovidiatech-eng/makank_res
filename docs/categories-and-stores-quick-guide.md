# Categories & Stores — Quick Integration Guide (client)

> البنية الجديدة بعد حذف `moduleId` و `sub-category`.
> كله تحت البريفكس `/api`.

## المفاهيم (concepts)

| المفهوم | بيمثل إيه |
| --- | --- |
| **Template categories** | الكاتيجوريز الأساسية المعمولة للقالب نفسه (بلوبرنت). |
| **Store categories** | كاتيجوريز المطعم الفعلية = اللي اتاخدت من القالب وقت إنشاء المطعم **+** أي كاتيجوري سبيشيال اتعملت للمطعم من غير قالب. |
| ~~Sub category~~ | **اتلغت خلاص** — مفيش حاجة اسمها sub-category. كله بقى `categories`. |

---

## Endpoints

### 1) كاتيجوريز القوالب (template blueprint)
> الكاتيجوريز الأساسية بتاعت القالب نفسه.

| الاستخدام | Endpoint |
| --- | --- |
| اجيب كاتيجوريز القوالب | `GET /api/store-templates/categories` |
| اضيف كاتيجوري لقالب | `POST /api/store-templates/:id/categories` |
| اعدل كاتيجوري قالب | `PATCH /api/store-templates/categories/:id` |
| امسح كاتيجوري قالب | `DELETE /api/store-templates/categories/:id` |

---

### 2) كاتيجوريز المطعم الفعلية (store categories)
> اللي خدها المطعم من القالب + اللي اتعملت سبيشيال للمطعم.

| الاستخدام | Endpoint |
| --- | --- |
| اجيب كل كاتيجوريز مطعم معيّن | `GET /api/categories?storeId=xxxx` |
| اكريت كاتيجوري سبيشيال لمطعم | `POST /api/categories` |
| اعدل كاتيجوري مطعم | `PATCH /api/categories/:id` |
| امسح كاتيجوري مطعم | `DELETE /api/categories/:id` |

---

### 3) المتاجر (stores)
> القوالب بقت هي اللي بتصنّف المتاجر (مفيش `moduleId`).

| الاستخدام | Endpoint |
| --- | --- |
| اجيب المتاجر اللي متطبّق عليها قالب معيّن (الماركت مثلاً) | `GET /api/stores?templateId=xxxx` |
| اجيب المتاجر اللي عندها كاتيجوري راجعة لكاتيجوري قالب معيّنة | `GET /api/stores?templateCategoryId=xxxx` |
| اجيب متجر واحد | `GET /api/stores/:id` |

---

## خلاصة سريعة (cheat sheet)

- كاتيجوريز القالب الأساسية → `GET /api/store-templates/categories`
- كل كاتيجوريز مطعم → `GET /api/categories?storeId=xxxx`
- اكريت كاتيجوري سبيشيال لمطعم → `POST /api/categories`
- متاجر القالب (الماركت..) → `GET /api/stores?templateId=xxxx`
- **مفيش sub-category خالص.**
