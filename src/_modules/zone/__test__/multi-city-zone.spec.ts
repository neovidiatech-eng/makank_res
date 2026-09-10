import { ZoneService } from '../zone.service';
import * as resolveCityHelper from 'src/globals/helpers/resolve-city-for-point.helper';
import * as polygonHelper from 'src/globals/helpers/point-in-polygon.helper';

describe('ZoneService — Multi-City Zone Resolution & Isolation', () => {
  let zoneService: ZoneService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      zone: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    zoneService = new ZoneService(mockPrisma as any, undefined as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('scopes resolveZoneId to the city containing the coordinates', async () => {
    const lat = 30.7865;
    const lng = 31.0004;

    jest.spyOn(resolveCityHelper, 'resolveCityForPoint').mockResolvedValue({
      id: 10,
      distanceKm: 2,
    });

    jest.spyOn(polygonHelper, 'isPointInPolygon').mockReturnValue(true);

    mockPrisma.zone.findMany.mockResolvedValue([
      { id: 101, coordinates: [{ lat: 30.78, lng: 31.0 }] },
    ]);

    const resolvedZoneId = await zoneService.resolveZoneId(lat, lng);

    expect(resolvedZoneId).toBe(101);
    expect(mockPrisma.zone.findMany).toHaveBeenCalledWith({
      where: { active: true, cityId: 10 },
      select: { id: true, coordinates: true },
    });
  });

  it('falls back to all active zones if point does not resolve to any specific city', async () => {
    const lat = 25.0000;
    const lng = 28.0000;

    jest.spyOn(resolveCityHelper, 'resolveCityForPoint').mockResolvedValue(null);
    jest.spyOn(polygonHelper, 'isPointInPolygon').mockReturnValue(false);

    mockPrisma.zone.findMany.mockResolvedValue([]);

    const resolvedZoneId = await zoneService.resolveZoneId(lat, lng);

    expect(resolvedZoneId).toBeNull();
    expect(mockPrisma.zone.findMany).toHaveBeenCalledWith({
      where: { active: true },
      select: { id: true, coordinates: true },
    });
  });

  it('scopes isPointInZone to the city of the point', async () => {
    const lat = 31.2001;
    const lng = 29.9187;

    jest.spyOn(resolveCityHelper, 'resolveCityForPoint').mockResolvedValue({
      id: 20,
      distanceKm: 1,
    });

    jest.spyOn(polygonHelper, 'isPointInPolygon').mockReturnValue(true);

    mockPrisma.zone.findMany.mockResolvedValue([
      { coordinates: [{ lat: 31.2, lng: 29.9 }] },
    ]);

    const inZone = await zoneService.isPointInZone(lat, lng);

    expect(inZone).toBe(true);
    expect(mockPrisma.zone.findMany).toHaveBeenCalledWith({
      where: { active: true, cityId: 20 },
      select: { coordinates: true },
    });
  });

  it('scopes each stop to its respective city in firstPointOutsideActiveZones', async () => {
    const stops = [
      { lat: 30.78, lng: 31.00 },
      { lat: 27.25, lng: 33.81 },
    ];

    jest.spyOn(resolveCityHelper, 'resolveCityForPoint')
      .mockResolvedValueOnce({ id: 10, distanceKm: 1 })
      .mockResolvedValueOnce({ id: 30, distanceKm: 1 });

    jest.spyOn(polygonHelper, 'isPointInPolygon')
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    mockPrisma.zone.findMany
      .mockResolvedValueOnce([{ coordinates: [{ lat: 30.78, lng: 31.0 }] }])
      .mockResolvedValueOnce([{ coordinates: [{ lat: 27.25, lng: 33.8 }] }]);

    const outsideIndex = await zoneService.firstPointOutsideActiveZones(stops);

    expect(outsideIndex).toBe(1);
  });
});
