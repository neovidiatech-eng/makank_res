# Post-Implementation Audit Report
## Browse Flow + Store Setup Templates

**Date:** 2026-06-13  
**Reviewer:** Code audit (no changes made)  
**Codebase state:** Post-implementation, permissions seeded

---

## Executive Summary

| | |
|---|---|
| **Overall verdict** | Production-ready with minor fixes |
| **Critical bugs** | 0 |
| **High severity** | 1 |
| **Medium severity** | 3 |
| **Low severity** | 4 |
| **Informational** | 3 |

The core implementation is architecturally sound. Store visibility enforcement is correct. Product visibility enforcement is correct through two independent layers. Template snapshot semantics are correct. No data leakage paths were found. The issues found are a race condition with an unclean error response, a missing default sort on one endpoint, an undocumented mandatory lat/lng constraint, and a minor store-owner UX asymmetry that predates this feature.

---

## Findings

---

### F-01 · Race Condition on Duplicate Template Apply

**Severity: HIGH**  
**Status: FIXED**  
**Location:** `store-template.service.ts` — `applyToStore`

**Description:**  
The duplicate-protection check was a two-step: application-level `findUnique` → if clear, open transaction → write ledger. Two concurrent `POST /stores/:id/apply-template` requests could both pass the application-level check simultaneously, both enter the transaction, one commit the `StoreTemplateApplication` row, and the second fail with a raw Prisma `P2002 Unique constraint violation` propagating as an unhandled 500 rather than a clean 409.

The DB constraint (`@@unique([storeId, templateId])`) correctly prevented duplicate data, but the error response to the second caller was a 500 Internal Server Error, not a 409.

**Fix applied:** Added `PrismaClientKnownRequestError` P2002 catch around the transaction body. The second concurrent request now receives a 409 ConflictException identical to the serial path.

---

### F-02 · `GET /stores?customerCategoryId=` Silently Requires lat/lng for Visitors

**Severity: MEDIUM**  
**Status: DOCUMENTED**  
**Location:** `store.interceptors/auth.store.interceptor.ts`

**Description:**  
`AuthStoreInterceptor` throws HTTP 400 for visitors who don't pass `lat` and `lng`. The browse-flow integration guide did not mention this constraint, so a frontend developer calling `GET /stores?customerCategoryId=3` without coordinates would receive an undocumented 400.

**Fix applied:** Added an explicit callout in `docs/browse-flow-and-store-templates.md` Step 3 of the customer browse flow.

---

### F-03 · `GET /customer-categories` Has No Default Sort Order

**Severity: MEDIUM**  
**Status: OPEN**  
**Location:** `customer-category.prisma.args.ts:27–30`

**Description:**  
`getCustomerCategoryArgs` only adds an `orderBy` clause when the client provides one via `?orderBy=`. Without it, Prisma emits no `ORDER BY` and results come back in database-native (non-deterministic) order. The `GET /home` endpoint is unaffected — it hardcodes `orderBy: [{ order: 'asc' }, { id: 'asc' }]` directly.

**Recommendation:**  
Add a default `[{ order: 'asc' }, { id: 'asc' }]` fallback inside `getCustomerCategoryArgs` when `orderArray` is empty.

---

### F-04 · Store Owners Cannot See Own PENDING Services via Grouped Products Endpoint

**Severity: MEDIUM**  
**Status: FIXED**  
**Location:** `storeModule.service.ts` — `findGroupedByStore`

**Description:**  
`findGroupedByStore` gated the ACTIVE-only filter on `roleKey === RolesKeys.ADMIN`. Store owners have roleKey `'Store'`, so they could not see their own PENDING imported services via `GET /stores/:id/products`, making template activation impractical.

This was a pre-existing issue not introduced by this feature, but it materially affected the template activation workflow.

**Fix applied:** Broadened the check to `roleKey === RolesKeys.ADMIN || roleKey === RolesKeys.STORE`. Store owners now see all service statuses on their own store's product page.

---

### F-05 · `GET /home` Accepts lat/lng Parameters but Does Not Use Them

**Severity: LOW**  
**Status: OPEN (by design, deferred)**  
**Location:** `home.service.ts:9`, `home.controller.ts`

**Description:**  
The controller exposes `lat` and `lng` query parameters and passes them to `getHome()`, but `getHome()` names them `_lat` and `_lng` (unused). The plan deferred `featuredStores`. The parameters are live-advertised in Swagger with no effect.

**Recommendation:**  
Remove the params until `featuredStores` is implemented, or document them as reserved.

---

### F-06 · `customer-category.delete()` Performs a Hard Delete

**Severity: LOW**  
**Status: FIXED**  
**Location:** `customer-category.service.ts:32`

**Description:**  
`CustomerCategoryService.delete()` called `prisma.customerCategory.delete()` (hard delete) while the schema has a `deletedAt` field. This inconsistency with the codebase-wide soft-delete pattern would permanently remove the tile and cascade-delete all `StoreCustomerCategory` join rows.

**Fix applied:** Changed to `update({ data: { deletedAt: new Date() } })` to match the codebase convention.

---

### F-07 · `console.log(categoryId)` in `store.service.ts` (Pre-existing)

**Severity: LOW**  
**Status: OPEN (pre-existing)**  
**Location:** `store.service.ts:83`

**Description:**  
A debug `console.log(categoryId)` left in the store creation flow leaks data to server logs. Not introduced by this feature.

**Recommendation:** Remove the log line.

---

### F-08 · Template Hard Delete Loses Audit Trail for Applied Templates

**Severity: LOW**  
**Status: OPEN**  
**Location:** `store-template.prisma` — `StoreTemplateApplication.template` relation

**Description:**  
`StoreTemplateApplication` rows cascade-delete when their parent `StoreTemplate` is deleted. After a template is hard-deleted, there is no record that any store was provisioned from it. Cloned services/categories are unaffected, but the audit history is lost.

**Recommendation:**  
Consider `SetNull` or `Restrict` on the template FK in `StoreTemplateApplication`, or switch template deletes to soft-delete only.

---

### F-09 · `isCustomerPath` Flag in `getServiceArgs` is Dead Code in All Current Call Sites

**Severity: INFORMATIONAL**  
**Status: OPEN**  
**Location:** `service.prisma.args.ts:13`

**Description:**  
`getServiceArgs` was extended with an `isCustomerPath` parameter but no call site passes `true` for it. The `/services` route is covered by `AuthServiceInterceptor` which sets `status=ACTIVE` and `available=true` directly on the filter. The parameter has no current effect.

**Recommendation:**  
Wire it to actual call sites or remove it — the interceptor already handles enforcement.

---

### F-10 · Price Documentation Needs Precision

**Severity: INFORMATIONAL**  
**Status: OPEN**  
**Location:** `docs/browse-flow-and-store-templates.md`

**Description:**  
The integration guide states "Always use the default Size price (`isDefault: true`) as the displayed price." This is imprecise. The `mapServiceObject` helper produces `priceWithDefaultOptions` which is the commission-inclusive, discount-aware effective price. The frontend should use `priceWithDefaultOptions` directly, not re-derive it from the raw size list.

**Recommendation:**  
Update the doc: *"Display `priceWithDefaultOptions` as the headline price — it is already commission-inclusive and discount-aware for the default size."*

---

### F-11 · `GET /home` Banners Not Filtered by Date Range

**Severity: INFORMATIONAL**  
**Status: FIXED**  
**Location:** `home.service.ts`

**Description:**  
The banner model has `startDate` and `endDate` fields. The home endpoint filtered `active: true, deletedAt: null` but did not apply the date-range guard. Banners outside their active window could appear in the home response. The existing `banner.prisma.args.ts` already uses the correct date-range pattern.

**Fix applied:** Added `startDate`/`endDate` guards to the banner query in `home.service.ts`, matching the pattern from `banner.prisma.args.ts`.

---

## Detailed Check Results

| # | Check | Result | Key Finding |
|---|---|---|---|
| 1 | Home Flow | ✅ PASS | Two parallel queries, no N+1. "All" is virtual (no row). lat/lng accepted but silently ignored. |
| 2 | Browse Flow | ✅ PASS | Multi-tile assignment works. Removal works. No category mixing. Sort order issue on standalone `/customer-categories`. |
| 3 | Store Visibility | ✅ PASS | `enforceVisible` correctly wired for visitors and customers. Admin bypass confirmed. No leakage path found. |
| 4 | Product Visibility | ✅ PASS | Two independent layers (interceptor + inline check). Visitor override of `?status=PENDING` blocked by interceptor. Store owner gap is pre-existing. |
| 5 | Template Parity | ✅ PASS with notes | All required fields mirrored. Status intentionally absent. Metrics intentionally absent. No FK back to template in cloned rows. |
| 6 | Template Application | ✅ PASS with caveat | Transaction is correct. Store untouched on failure. Race condition fixed (F-01). |
| 7 | PENDING Activation | ✅ PASS | PENDING enforced at create. Both browse paths filter it. Interceptor blocks `?status=PENDING` override for visitors. |
| 8 | Duplicate Protection | ✅ PASS | DB unique constraint is the real guard. App-level check for serial path. Race condition error response fixed (F-01). |
| 9 | Price Consistency | ✅ PASS | Commission applied once at read time. `priceWithDefaultOptions` is the correct display field. Doc wording noted (F-10). |
| 10 | Template Lifecycle | ✅ PASS | Zero coupling between template tables and live tables after clone. Hard delete audit trail gap noted (F-08). |

---

## Template Parity Table

| Live Field | Live Type | TemplateService Field | Mirrored | Justification |
|---|---|---|---|---|
| `name` | Json req | `name` Json | ✅ | Required |
| `description` | Json req | `description` Json | ✅ | Required |
| `image` | String req | `image` String | ✅ | Required, validated in create |
| `durationMinutes` | Int req | `durationMinutes` Int | ✅ | Required |
| `price` | Float req | `price` Float | ✅ | Required |
| `commission` | Float? | `commission` Float? | ✅ | Optional, documented |
| `priceAfterDiscount` | Float? | `priceAfterDiscount` Float? | ✅ | Optional, `LessThanField` validated |
| `status` | ServiceStatus | **absent** | ✅ by design | Always cloned as `PENDING` |
| `available` | Boolean default true | `available` Boolean default true | ✅ | |
| `bestRated` | Boolean? default false | `bestRated` Boolean? default false | ✅ | |
| `mostSeller` | Boolean? default false | `mostSeller` Boolean? default false | ✅ | |
| `totalOrders` | Int default 0 | **absent** | ✅ by design | Runtime metric, schema default = 0 |
| `totalAmountSold` | Int default 0 | **absent** | ✅ by design | Runtime metric |
| `rating` | Float default 0 | **absent** | ✅ by design | Runtime metric |
| `review` | Int default 0 | **absent** | ✅ by design | Runtime metric |
| `storeId` | Int req | **absent** | ✅ by design | Set at apply time |
| `categoryId` | Int req | **absent** | ✅ by design | Set to cloned category at apply time |
| `Favorites` relation | — | **absent** | ✅ by design | No FK to template |
| `createdAt` | DateTime auto | **absent** | ✅ | Auto-generated on clone |
| `deletedAt` | DateTime? | `deletedAt` DateTime? | ✅ | Soft-delete support |

**ServiceSize parity:** All four fields (`name`, `price`, `priceAfterDiscount`, `isDefault`) mirrored correctly. Template sizes have no `deletedAt` — acceptable since template sizes are not individually soft-deletable at MVP.

**ServiceAddon parity:** Both fields (`name`, `price`) mirrored correctly.

---

## Final Verdict

**Production-ready with minor fixes.**

The implementation is structurally correct. No data leakage, no security holes, no broken transactions, no accidental coupling between template and live data.

| Priority | Finding | Status |
|---|---|---|
| **Required** | F-01 Race condition → 500 on concurrent duplicate apply | ✅ Fixed |
| **Required** | F-06 Hard delete on CustomerCategory | ✅ Fixed |
| **Required** | F-11 Banners not date-filtered on home | ✅ Fixed |
| **Strongly recommended** | F-02 lat/lng requirement undocumented | ✅ Documented |
| **Next iteration** | F-03 Default sort order on `/customer-categories` | Open |
| **Required** | F-04 Store owner cannot see PENDING via grouped endpoint | ✅ Fixed |
| **Next iteration** | F-05 Unused lat/lng params on home endpoint | Open (deferred by design) |
| **Next iteration** | F-07 Debug console.log in store.service.ts | Open (pre-existing) |
| **Next iteration** | F-08 Template hard delete loses audit trail | Open |
| **Next iteration** | F-09 isCustomerPath dead code | Open |
| **Next iteration** | F-10 Price display wording in docs | Open |
