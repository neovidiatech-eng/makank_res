# Banner Swagger Test Guide

Banners no longer have `moduleId`, and `GET /api/banners?moduleId=` is retired.

## Target Types

| Target type | Required fields | Validation |
| --- | --- | --- |
| `GENERAL` | none | No store/category/service/zone targeting. |
| `STORE` | `storeId` | Store must exist. |
| `CATEGORY` | `storeId`, `categoryId` | Category must be store-owned: `Category.storeId === storeId`. |
| `SERVICE` | `storeId`, `categoryId`, `serviceId` | Service must belong to the store and selected category. |
| `ZONE` | `storeId`, `zoneIds` | Zones must be linked to the store's branches. |
| `SPECIAL_DRIVER` | none | No store/category/service/zone targeting. |

## Create Examples

General:

```json
{
  "name": { "en": "General", "ar": "عام" },
  "image": "uploads/banner/x.jpg",
  "targetType": "GENERAL",
  "order": 1
}
```

Category:

```json
{
  "name": { "en": "Category", "ar": "فئة" },
  "image": "uploads/banner/x.jpg",
  "targetType": "CATEGORY",
  "storeId": 42,
  "categoryId": 12
}
```

`categoryId` must point to a `Category` row owned by the same store.
Module-wide categories no longer exist.

## Removed

- `CreateBannerDTO.moduleId`
- `FilterBannerDTO.moduleId`
- `Banner.moduleId`
- Admin grouping/filtering by module
