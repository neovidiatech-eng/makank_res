// resolveCityForPoint — single source of truth for "which city does this
// lat/lng belong to". Only active cities with lat/lng set are candidates;
// the nearest one whose radius+toleranceRadius covers the point wins.
import { resolveCityForPoint } from '../resolve-city-for-point.helper';

const buildPrisma = (cities: any[]) => ({
  city: { findMany: jest.fn().mockResolvedValue(cities) },
});

describe('resolveCityForPoint', () => {
  it('returns null when lat/lng are not provided', async () => {
    const prisma = buildPrisma([]);
    expect(await resolveCityForPoint(prisma as any, null, null)).toBeNull();
    expect(prisma.city.findMany).not.toHaveBeenCalled();
  });

  it('returns null when no active city covers the point', async () => {
    const prisma = buildPrisma([
      { id: 1, lat: 30.0444, lng: 31.2357, radius: 15, toleranceRadius: 5 }, // Cairo
    ]);
    // A point ~1000km away (Cairo vs. far south)
    const result = await resolveCityForPoint(prisma as any, 15.0, 31.0);
    expect(result).toBeNull();
  });

  it('resolves to the covering city when the point is inside its radius+tolerance', async () => {
    const prisma = buildPrisma([
      { id: 1, lat: 30.0444, lng: 31.2357, radius: 15, toleranceRadius: 5 },
    ]);
    const result = await resolveCityForPoint(prisma as any, 30.05, 31.24);
    expect(result?.id).toBe(1);
  });

  it('picks the nearest city when two cities both cover the point', async () => {
    const prisma = buildPrisma([
      { id: 1, lat: 30.0444, lng: 31.2357, radius: 30, toleranceRadius: 5 }, // far but wide
      { id: 2, lat: 30.05, lng: 31.24, radius: 30, toleranceRadius: 5 }, // very close
    ]);
    const result = await resolveCityForPoint(prisma as any, 30.05, 31.24);
    expect(result?.id).toBe(2);
  });

  it('never matches a city missing lat/lng or an inactive one (filtered by the query itself)', async () => {
    const prisma = buildPrisma([]); // simulates the where: {active:true, lat/lng not null} finding nothing
    const result = await resolveCityForPoint(prisma as any, 30.05, 31.24);
    expect(result).toBeNull();
    expect(prisma.city.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, lat: { not: null }, lng: { not: null } },
      }),
    );
  });
});
