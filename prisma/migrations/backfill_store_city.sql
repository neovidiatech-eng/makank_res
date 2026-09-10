-- Multi-city isolation: backfill cityId for stores that were created before
-- city scoping was introduced. Uses the nearest active city within its radius.
-- Run ONCE before deploying the zone.service.ts city-scoped changes.
-- Safe to re-run: WHERE s.city_id IS NULL means already-set rows are skipped.

UPDATE stores s
INNER JOIN branches b ON b.store_id = s.id
INNER JOIN city c ON (
  c.active = 1
  AND ST_Distance_Sphere(
    POINT(b.lng, b.lat),
    POINT(c.lng, c.lat)
  ) <= ((COALESCE(c.radius, 15) + COALESCE(c.tolerance_radius, 5)) * 1000)
)
SET s.city_id = c.id
WHERE s.city_id IS NULL
  AND b.is_active = 1
  AND b.deleted_at IS NULL;
