# Browse Flow And Store Templates

The customer browse flow is driven by `TemplateCategory`.

1. `GET /api/home` returns `categories` from active templates and active banners.
2. The customer taps a category.
3. The app calls `GET /api/stores?templateCategoryId=:id&lat=:lat&lng=:lng`.
4. The customer opens a store, then reads its menu with `GET /api/categories?storeId=:id`.

## Home

`GET /api/home` response shape:

```json
{
  "categories": [
    {
      "id": 3,
      "name": { "ar": "طعام", "en": "Food" },
      "image": "uploads/category/food.png",
      "order": 3,
      "templateId": 1
    }
  ],
  "banners": [
    {
      "id": 1,
      "name": { "ar": "...", "en": "..." },
      "image": "uploads/banner/x.jpg",
      "targetType": "GENERAL",
      "storeId": null,
      "categoryId": null,
      "serviceId": null
    }
  ]
}
```

The previous `customerCategories` property is retired.

## Store Browse

Use:

```http
GET /api/stores?templateCategoryId=3&lat=30.0444&lng=31.2357
```

`templateCategoryId` matches stores that have a cloned `Category` with that
`templateCategoryId`. Coordinates are still required for visitor/customer nearest
store behavior.

Retired:

- `GET /api/stores?customerCategoryId=`
- `GET /api/stores?categoryId=`
- `GET /api/stores?moduleId=`
- `/api/customer-categories*`
- `/api/store-categories*`

## Store Menu

Store-owned `Category` rows are the real menu/product grouping. Template-created
categories are cloned into `Category(storeId, templateCategoryId)`, and store
owners/admins can add custom store categories through `POST /api/categories`.

Services/products attach to store categories with `Service.categoryId`.
