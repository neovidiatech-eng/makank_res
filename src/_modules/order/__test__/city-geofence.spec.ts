import { BadRequestException } from '@nestjs/common';
import { HelpersService } from '../services/helpers.service';

describe('HelpersService — City Geofencing & Grace Buffer', () => {
  let helpersService: HelpersService;
  let mockPrisma: any;

  // City center in Cairo (lat: 30.0444, lng: 31.2357)
  const cityCenter = { lat: 30.0444, lng: 31.2357 };

  beforeEach(() => {
    mockPrisma = {
      city: {
        findUnique: jest.fn(),
      },
      branch: {
        findUnique: jest.fn(),
      },
    };
    helpersService = new HelpersService(
      mockPrisma as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
    );
  });

  it('allows delivery location within the core city radius (e.g. 5 km away from 15 km radius city)', async () => {
    // 5 km away from city center (approx 0.045 deg lat shift)
    const destLat = 30.0894;
    const destLng = 31.2357;

    mockPrisma.city.findUnique.mockResolvedValue({
      id: 1,
      name: { ar: 'القاهرة', en: 'Cairo' },
      lat: cityCenter.lat,
      lng: cityCenter.lng,
      radius: 15,
      toleranceRadius: 5,
    });

    await expect(
      helpersService.validateCityCoverage(1, destLat, destLng),
    ).resolves.not.toThrow();
  });

  it('allows delivery location within the 5 km grace buffer (e.g. 18 km away when radius=15 and tolerance=5)', async () => {
    // ~18 km away (approx 0.16 deg lat shift)
    const destLat = 30.2044;
    const destLng = 31.2357;

    mockPrisma.city.findUnique.mockResolvedValue({
      id: 1,
      name: { ar: 'القاهرة', en: 'Cairo' },
      lat: cityCenter.lat,
      lng: cityCenter.lng,
      radius: 15,
      toleranceRadius: 5,
    });

    await expect(
      helpersService.validateCityCoverage(1, destLat, destLng),
    ).resolves.not.toThrow();
  });

  it('rejects delivery location exceeding city radius + 5 km grace buffer (e.g. 25 km away)', async () => {
    // ~25 km away (approx 0.225 deg lat shift)
    const destLat = 30.2694;
    const destLng = 31.2357;

    mockPrisma.city.findUnique.mockResolvedValue({
      id: 1,
      name: { ar: 'القاهرة', en: 'Cairo' },
      lat: cityCenter.lat,
      lng: cityCenter.lng,
      radius: 15,
      toleranceRadius: 5,
    });

    await expect(
      helpersService.validateCityCoverage(1, destLat, destLng),
    ).rejects.toThrow(BadRequestException);
  });

  it('passes validation when city coordinates (lat/lng) are null / unconfigured', async () => {
    const destLat = 30.9999;
    const destLng = 31.9999;

    mockPrisma.city.findUnique.mockResolvedValue({
      id: 2,
      name: { ar: 'مدينة بدون إحداثيات', en: 'Unconfigured City' },
      lat: null,
      lng: null,
      radius: 15,
      toleranceRadius: 5,
    });

    await expect(
      helpersService.validateCityCoverage(2, destLat, destLng),
    ).resolves.not.toThrow();
  });

  it('allows delivery location inside polygon city coordinates', async () => {
    const polygonCity = {
      id: 3,
      name: { ar: 'القاهرة بوليجون', en: 'Cairo Polygon' },
      coordinates: [
        { lat: 30.0, lng: 31.0 },
        { lat: 30.1, lng: 31.0 },
        { lat: 30.1, lng: 31.1 },
        { lat: 30.0, lng: 31.1 },
      ],
    };

    mockPrisma.city.findUnique.mockResolvedValue(polygonCity);

    await expect(
      helpersService.validateCityCoverage(3, 30.05, 31.05),
    ).resolves.not.toThrow();
  });

  it('rejects delivery location outside polygon city coordinates', async () => {
    const polygonCity = {
      id: 3,
      name: { ar: 'القاهرة بوليجون', en: 'Cairo Polygon' },
      coordinates: [
        { lat: 30.0, lng: 31.0 },
        { lat: 30.1, lng: 31.0 },
        { lat: 30.1, lng: 31.1 },
        { lat: 30.0, lng: 31.1 },
      ],
    };

    mockPrisma.city.findUnique.mockResolvedValue(polygonCity);

    await expect(
      helpersService.validateCityCoverage(3, 30.5, 31.5),
    ).rejects.toThrow(BadRequestException);
  });
});
