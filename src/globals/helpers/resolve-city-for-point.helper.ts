import { PrismaService } from 'src/globals/services/prisma.service';
import { calculateDistance } from './calculateDistance.helper';
import { isPointInPolygon } from './point-in-polygon.helper';

export async function resolveCityForPoint(
  prisma: PrismaService,
  lat?: number | null,
  lng?: number | null,
): Promise<{ id: number; distanceKm: number } | null> {
  if (lat == null || lng == null) return null;

  const cities = await prisma.city.findMany({
    where: { active: true },
    select: {
      id: true,
      lat: true,
      lng: true,
      radius: true,
      toleranceRadius: true,
      coordinates: true,
    },
  });

  let nearest: { id: number; distanceKm: number } | null = null;
  for (const city of cities) {
    const coordinates = city.coordinates as Array<{ lat: number; lng: number }> | null;
    if (coordinates && Array.isArray(coordinates) && coordinates.length >= 3) {
      if (isPointInPolygon({ lat, lng }, coordinates)) {
        let distKm = 0;
        if (city.lat != null && city.lng != null) {
          distKm = calculateDistance(city.lat, city.lng, lat, lng) / 1000;
        }
        if (!nearest || distKm < nearest.distanceKm) {
          nearest = { id: city.id, distanceKm: distKm };
        }
      }
      continue;
    }

    if (city.lat == null || city.lng == null) continue;

    const distKm = calculateDistance(city.lat, city.lng, lat, lng) / 1000;
    const maxAllowedKm = (city.radius ?? 15) + (city.toleranceRadius ?? 5);
    if (distKm > maxAllowedKm) continue;
    if (!nearest || distKm < nearest.distanceKm) {
      nearest = { id: city.id, distanceKm: distKm };
    }
  }

  return nearest;
}
