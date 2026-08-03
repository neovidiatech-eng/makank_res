import { PrismaService } from 'src/globals/services/prisma.service';
import { calculateDistance } from './calculateDistance.helper';

// Single source of truth for "which city (if any) does this lat/lng belong
// to" — used both to auto-derive a store's cityId from its own branch
// location, and to gate the customer store listing to only the city the
// customer is physically inside. A point can fall inside more than one
// city's radius+toleranceRadius circle near a border; the nearest center
// wins. Only `active` cities with lat/lng actually set are candidates —
// an inactive city, or one never backfilled with coordinates, never
// matches, so it (and everything scoped to it) simply has no effect
// rather than throwing.
export async function resolveCityForPoint(
  prisma: PrismaService,
  lat?: number | null,
  lng?: number | null,
): Promise<{ id: number; distanceKm: number } | null> {
  if (lat == null || lng == null) return null;

  const cities = await prisma.city.findMany({
    where: { active: true, lat: { not: null }, lng: { not: null } },
    select: { id: true, lat: true, lng: true, radius: true, toleranceRadius: true },
  });

  let nearest: { id: number; distanceKm: number } | null = null;
  for (const city of cities) {
    const distKm = calculateDistance(city.lat, city.lng, lat, lng) / 1000;
    const maxAllowedKm = (city.radius ?? 15) + (city.toleranceRadius ?? 5);
    if (distKm > maxAllowedKm) continue;
    if (!nearest || distKm < nearest.distanceKm) {
      nearest = { id: city.id, distanceKm: distKm };
    }
  }

  return nearest;
}
