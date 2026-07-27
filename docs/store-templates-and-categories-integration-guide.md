# Store Templates And Categories Integration Guide

Store templates are now module-free blueprints. A template owns `TemplateCategory`
rows, and those template categories are the customer/home taxonomy.

## Model

| Concept | Model | Purpose |
| --- | --- | --- |
| Template category | `TemplateCategory` | Admin-managed browse/home category and template blueprint category. |
| Store category | `Category` with `storeId` | Store-owned menu/product category. Services attach with `Service.categoryId`. |

Removed from this flow: `Store.moduleId`, `Category.moduleId`, `StoreCategory`,
`CustomerCategory`, and `StoreCustomerCategory`.

## Templates

Create templates with a loose string `moduleType` and no `moduleId`.

```http
POST /api/store-templates
```

```json
{
  "name": { "en": "Market Template", "ar": "قالب ماركت" },
  "description": { "en": "Default market categories", "ar": "تصنيفات ماركت افتراضية" },
  "moduleType": "market",
  "order": 1,
  "categories": [
    {
      "name": { "en": "Dairy", "ar": "ألبان" },
      "order": 1,
      "services": []
    }
  ]
}
```

`moduleId` is not accepted. `moduleType` is only a free-form string for admin
labeling/filtering.

## Store Creation

Create stores with `templateId` only. The backend validates the active template,
creates the store, then clones each `TemplateCategory` into a store-owned
`Category` row:

```json
{
  "name": { "en": "Downtown Market", "ar": "ماركت وسط البلد" },
  "templateId": 1,
  "logo": "uploads/store/logo.png",
  "cover": "uploads/store/cover.png",
  "lat": 30.0444,
  "lng": 31.2357,
  "address": "Cairo",
  "User": {
    "name": "Owner",
    "email": "owner@example.com",
    "phone": "01000000000",
    "password": "secret"
  }
}
```

Each cloned `Category` stores `templateCategoryId` so browse filters can find
stores that came from a selected template category.

## Category Reads

`GET /api/categories?storeId=:id` returns that store's real menu categories:
template-cloned categories plus custom categories created later through
`POST /api/categories`.

`GET /api/categories?moduleId=` is retired.

## Browse

Home returns template categories:

```http
GET /api/home
```

```json
{
  "categories": [
    { "id": 1, "name": { "en": "Dairy" }, "image": null, "order": 1, "templateId": 1 }
  ],
  "banners": []
}
```

Browse stores by selected template category:

```http
GET /api/stores?templateCategoryId=1&lat=30.0444&lng=31.2357
```

Retired browse params: `moduleId`, `categoryId`, and `customerCategoryId`.

## Removed Endpoints

`/api/store-categories*` and `/api/customer-categories*` are removed. Store
discovery no longer uses manual many-to-many category tags.
