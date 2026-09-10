import { HomeService } from '../home.service';
import * as resolveCityHelper from 'src/globals/helpers/resolve-city-for-point.helper';

describe('HomeService — Multi-City Banner Isolation', () => {
  let homeService: HomeService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      storeTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      templateCategory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      banner: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    homeService = new HomeService(mockPrisma as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('filters banners by resolved city zones + global banners when lat/lng are provided', async () => {
    const lat = 30.7865;
    const lng = 31.0004;

    jest.spyOn(resolveCityHelper, 'resolveCityForPoint').mockResolvedValue({
      id: 7,
      distanceKm: 1.5,
    });

    await homeService.getHome(lat, lng);

    const bannerCall = mockPrisma.banner.findMany.mock.calls[0][0];
    const andArray = bannerCall.where.AND;

    const cityFilter = andArray.find((item: any) => item.OR && item.OR.some((sub: any) => sub.Zones));

    expect(cityFilter).toBeDefined();
    expect(cityFilter.OR).toEqual([
      { Zones: { some: { Zone: { cityId: 7 } } } },
      { Zones: { none: {} } },
    ]);
  });

  it('omits city banner filter when lat/lng are missing (returns all banners)', async () => {
    await homeService.getHome();

    const bannerCall = mockPrisma.banner.findMany.mock.calls[0][0];
    const andArray = bannerCall.where.AND;

    const cityFilter = andArray.find((item: any) => item.OR && item.OR.some((sub: any) => sub.Zones));
    expect(cityFilter).toBeUndefined();
  });
});
