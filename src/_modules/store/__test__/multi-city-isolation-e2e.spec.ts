import { StoreService } from '../services/store.service';
import { StoreNearestService } from '../services/store.nearest.service';
import { HomeService } from '../../home/home.service';

describe('Multi-City Isolation, Module/Category Filters & Item Search', () => {
  const makeStore = (id: number, cityId: number | null, name = 'Store ' + id) => ({
    id,
    cityId,
    name: { ar: name, en: name },
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

  const tantaCity = {
    id: 2,
    lat: 30.7865,
    lng: 31.0004,
    radius: 15,
    toleranceRadius: 5,
  };

  const buildStoreService = (storeRows: any[], cities: any[] = [cairoCity, tantaCity]) => {
    const prisma = {
      store: { findMany: jest.fn().mockResolvedValue(storeRows) },
      coupon: { findMany: jest.fn().mockResolvedValue([]) },
      city: { findMany: jest.fn().mockResolvedValue(cities) },
      service: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const nearestService = {
      getNearestStores: jest.fn().mockResolvedValue(storeRows),
    };
    const Language = {
      getCashedLanguages: jest.fn().mockResolvedValue([
        { code: 'ar', key: 'ar' },
        { code: 'en', key: 'en' },
      ]),
    };
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
    return { service, prisma, nearestService };
  };

  describe('1. Complete City Isolation in StoreService', () => {
    it('strictly isolates query to filter.cityId when explicitly provided', async () => {
      const storeCairo = makeStore(1, 1, 'مطعم المحلة');
      const storeTanta = makeStore(2, 2, 'مطعم طنطا');
      const { service, prisma } = buildStoreService([storeTanta]);

      await service.findAll({ cityId: 2 } as any, true);

      expect(prisma.store.findMany).toHaveBeenCalled();
      const args = prisma.store.findMany.mock.calls[0][0];
      const whereStr = JSON.stringify(args.where);
      // CityId 2 must be strictly present
      expect(whereStr).toContain('"cityId":2');
      // Must NOT contain cityId: null OR bypass
      expect(whereStr).not.toContain('"cityId":null');
    });

    it('strictly scopes to resolvedCityId when lat/lng are provided without explicit cityId', async () => {
      const { service, prisma } = buildStoreService([makeStore(1, 1)]);

      // Coordinates inside Cairo (city 1)
      await service.findAll({ lat: 30.05, lng: 31.24 } as any, true);

      expect(prisma.store.findMany).toHaveBeenCalled();
      const args = prisma.store.findMany.mock.calls[0][0];
      const whereStr = JSON.stringify(args.where);
      expect(whereStr).toContain('"cityId":1');
      expect(whereStr).not.toContain('"cityId":null');
    });
  });

  describe('2. StoreNearestService SQL City Isolation', () => {
    it('applies s.cityId = ? in buildWhere and filters strictly by cityId', async () => {
      const prisma = {
        city: {
          findMany: jest.fn().mockResolvedValue([cairoCity, tantaCity]),
        },
        $queryRawUnsafe: jest.fn().mockResolvedValue([
          { id: 1, branchId: 10, cityId: 1, distance: 2.5 },
          { id: 2, branchId: 20, cityId: 2, distance: 3.1 },
          { id: 3, branchId: 30, cityId: null, distance: 1.0 },
        ]),
      };

      const nearestService = new StoreNearestService(prisma as any);

      // Request specifically for cityId = 2 (Tanta)
      const results = await nearestService.getNearestStores(
        50,
        10,
        { lat: 30.78, lng: 31.00, cityId: 2 } as any,
      );

      // Verify the raw SQL where query received s.cityId = ? with parameter 2
      const callArgs = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = callArgs[0];
      expect(sql).toContain('s.cityId = ?');
      expect(callArgs).toContain(2);

      // In results, only store with cityId === 2 must remain (no null, no city 1)
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(2);
      expect(results[0].cityId).toBe(2);
    });
  });

  describe('3. Food / Item Name Search in StoreService', () => {
    it('searches across Store name, Services name, and SubCategories name for customer searches', async () => {
      const { service, prisma } = buildStoreService([makeStore(1, 1)]);

      await service.findAll(
        { search: 'شاورما', cityId: 1 } as any,
        true, // isVisitor / customer -> enforceVisible = true
      );

      expect(prisma.store.findMany).toHaveBeenCalled();
      const args = prisma.store.findMany.mock.calls[0][0];
      const whereStr = JSON.stringify(args.where);

      // Expect Services and SubCategories conditions to be included in the search
      expect(whereStr).toContain('"Services"');
      expect(whereStr).toContain('"SubCategories"');
      expect(whereStr).toContain('شاورما');
      expect(whereStr).toContain('"cityId":1');
    });
  });

  describe('4. HomeService Banner City Isolation', () => {
    it('scopes banners to the provided cityId zones or global banners', async () => {
      const prisma = {
        storeTemplate: { findMany: jest.fn().mockResolvedValue([]) },
        templateCategory: { findMany: jest.fn().mockResolvedValue([]) },
        banner: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const homeService = new HomeService(prisma as any);

      await homeService.getHome(undefined, undefined, 2);

      expect(prisma.banner.findMany).toHaveBeenCalled();
      const args = prisma.banner.findMany.mock.calls[0][0];
      const whereStr = JSON.stringify(args.where);

      // Banner query must target cityId: 2 zones or global (none)
      expect(whereStr).toContain('"cityId":2');
      expect(whereStr).toContain('"none":{}');
    });

    it('falls back safely without error when invalid/negative cityId or NaN coordinates are passed', async () => {
      const prisma = {
        storeTemplate: { findMany: jest.fn().mockResolvedValue([]) },
        templateCategory: { findMany: jest.fn().mockResolvedValue([]) },
        banner: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const homeService = new HomeService(prisma as any);

      // Pass NaN or negative cityId
      await homeService.getHome(NaN, NaN, -5);

      expect(prisma.banner.findMany).toHaveBeenCalled();
      const args = prisma.banner.findMany.mock.calls[0][0];
      // Should NOT contain negative cityId or crash
      expect(JSON.stringify(args.where)).not.toContain('-5');
    });
  });

  describe('5. Robust Input Validation and Resilience', () => {
    it('StoreNearestService ignores invalid non-numeric cityId safely', async () => {
      const prisma = {
        city: { findMany: jest.fn().mockResolvedValue([]) },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };

      const nearestService = new StoreNearestService(prisma as any);
      await nearestService.getNearestStores(50, 10, {
        lat: 30.0,
        lng: 31.0,
        cityId: 'not-a-number',
      } as any);

      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
      const callArgs = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = callArgs[0];
      // Must NOT contain NaN or s.cityId = ?
      expect(sql).not.toContain('s.cityId = ?');
      expect(callArgs).not.toContain(NaN);
    });

    it('StoreService ignores non-numeric or negative cityId safely', async () => {
      const { service, prisma } = buildStoreService([makeStore(1, 1)]);

      await service.findAll({ cityId: -10 } as any, true);

      expect(prisma.store.findMany).toHaveBeenCalled();
      const args = prisma.store.findMany.mock.calls[0][0];
      const whereStr = JSON.stringify(args.where);
      expect(whereStr).not.toContain('"cityId":-10');
    });
  });
});
