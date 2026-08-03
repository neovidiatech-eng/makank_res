// StoreService.findAll — a customer/visitor browsing with a location only
// ever sees restaurants in whichever active city their own point resolves
// to (via resolveCityForPoint). Outside every active city's radius → no
// restaurants at all, not an unscoped/wrong-city list. The admin dashboard
// listing (no customerId, isVisitor=false) must be completely unaffected.
import { StoreService } from '../services/store.service';

const makeStore = (id: number, cityId: number | null) => ({
  id,
  cityId,
  branches: [
    {
      id: id * 10,
      status: 'OPEN',
      closed: false,
      temporarilyClosed: false,
      rating: 0,
      review: 0,
    },
  ],
  StoreCoupons: [],
});

const cairoCity = {
  id: 1,
  lat: 30.0444,
  lng: 31.2357,
  radius: 15,
  toleranceRadius: 5,
};

const buildService = (storeRows: any[], cities: any[] = [cairoCity]) => {
  const prisma = {
    store: { findMany: jest.fn().mockResolvedValue(storeRows) },
    coupon: { findMany: jest.fn().mockResolvedValue([]) },
    city: { findMany: jest.fn().mockResolvedValue(cities) },
  };
  const nearestService = { getNearestStores: jest.fn().mockResolvedValue([]) };
  const Language = { getCashedLanguages: jest.fn().mockResolvedValue([]) };
  const settingService = {
    getSettings: jest
      .fn()
      .mockResolvedValue({ shippingKMCharge: 10, storeNearestByKM: 5 }),
  };
  const serviceModuleHelper = { mapServices: jest.fn().mockResolvedValue([]) };
  const mapService = { getBatchDetails: jest.fn() };

  const service = new StoreService(
    prisma as any,
    nearestService as any,
    Language as any,
    settingService as any,
    undefined as any,
    mapService as any,
    undefined as any,
    undefined as any,
    undefined as any,
    serviceModuleHelper as any,
  );
  return { service, prisma };
};

describe('StoreService.findAll — customer city gating', () => {
  it('returns no stores when the customer point is outside every active city', async () => {
    const { service, prisma } = buildService([makeStore(1, 1)]);

    // Far south of Cairo, well outside its 20km radius+tolerance.
    const result = await service.findAll(
      { lat: 15.0, lng: 31.0 } as any,
      true,
    );

    expect(result).toEqual([]);
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });

  it('scopes results to the resolved city when the customer is inside it', async () => {
    const { service, prisma } = buildService([makeStore(1, 1)]);

    await service.findAll({ lat: 30.05, lng: 31.24 } as any, true);

    expect(prisma.store.findMany).toHaveBeenCalled();
    const args = prisma.store.findMany.mock.calls[0][0];
    expect(JSON.stringify(args.where)).toContain('"cityId":1');
  });

  it('does not apply any city gating when no lat/lng is provided', async () => {
    const { service, prisma } = buildService([makeStore(1, null)]);

    const result = await service.findAll({} as any, true);

    expect(prisma.city.findMany).not.toHaveBeenCalled();
    expect(result.map((s: any) => s.id)).toEqual([1]);
  });

  it('does not apply city gating on the admin dashboard listing', async () => {
    const { service, prisma } = buildService([makeStore(1, 1), makeStore(2, 2)]);

    const result = await service.findAll(
      { lat: 15.0, lng: 31.0 } as any,
      false, // admin, not customer/visitor
    );

    expect(prisma.city.findMany).not.toHaveBeenCalled();
    expect(result.map((s: any) => s.id)).toEqual([1, 2]);
  });
});
