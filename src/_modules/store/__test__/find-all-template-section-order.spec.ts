import { StoreService } from '../services/store.service';

const makeStoreWithTemplates = (
  id: number,
  name: string,
  branchStatus: string,
  templateApps: Array<{ templateId: number; order: number }>,
  storeOrder = 0,
) => ({
  id,
  name,
  storeOrder,
  branches: [
    {
      id: id * 10,
      status: branchStatus,
      closed: branchStatus === 'CLOSED',
      temporarilyClosed: false,
      rating: 0,
      review: 0,
    },
  ],
  StoreCoupons: [],
  TemplateApplications: templateApps,
});

const buildService = (storeRows: any[]) => {
  const prisma = {
    store: { findMany: jest.fn().mockResolvedValue(storeRows) },
    coupon: { findMany: jest.fn().mockResolvedValue([]) },
    service: { findMany: jest.fn().mockResolvedValue([]) },
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

describe('StoreService.findAll — section template ordering', () => {
  it('orders stores by section order when templateId is provided (non-zero orders first)', async () => {
    // Template 1 (e.g. Restaurants):
    // Store 1: unranked in template 1 (order: 0)
    // Store 2: rank 2 in template 1 (order: 2)
    // Store 3: rank 1 in template 1 (order: 1)
    // Store 4: unranked in template 1 (order: 0)
    const rows = [
      makeStoreWithTemplates(1, 'Store 1', 'OPEN', [{ templateId: 1, order: 0 }]),
      makeStoreWithTemplates(2, 'Store 2', 'OPEN', [{ templateId: 1, order: 2 }]),
      makeStoreWithTemplates(3, 'Store 3', 'OPEN', [{ templateId: 1, order: 1 }]),
      makeStoreWithTemplates(4, 'Store 4', 'OPEN', [{ templateId: 1, order: 0 }]),
    ];
    const { service } = buildService(rows);

    const result = await service.findAll(
      { templateId: 1 } as any,
      true, /* isVisitor */
    );

    // Expected order:
    // Store 3 (order: 1) first
    // Store 2 (order: 2) second
    // Stores 1 and 4 (order: 0) at the end, sorted by id
    expect(result.map((s: any) => s.id)).toEqual([3, 2, 1, 4]);
  });

  it('allows different ordering for different sections/templates', async () => {
    // Store A (id: 10): rank 1 in Restaurants (template 1), rank 2 in Supermarket (template 2)
    // Store B (id: 20): rank 2 in Restaurants (template 1), rank 1 in Supermarket (template 2)
    const rows = [
      makeStoreWithTemplates(10, 'Store A', 'OPEN', [
        { templateId: 1, order: 1 },
        { templateId: 2, order: 2 },
      ]),
      makeStoreWithTemplates(20, 'Store B', 'OPEN', [
        { templateId: 1, order: 2 },
        { templateId: 2, order: 1 },
      ]),
    ];
    const { service } = buildService(rows);

    const restaurantsResult = await service.findAll(
      { templateId: 1 } as any,
      true,
    );
    expect(restaurantsResult.map((s: any) => s.id)).toEqual([10, 20]);

    const supermarketResult = await service.findAll(
      { templateId: 2 } as any,
      true,
    );
    expect(supermarketResult.map((s: any) => s.id)).toEqual([20, 10]);
  });

  it('prioritizes open stores over closed stores regardless of section order', async () => {
    // Store 1: CLOSED with order 1
    // Store 2: OPEN with order 2
    // Store 3: OPEN with order 0 (unranked)
    const rows = [
      makeStoreWithTemplates(1, 'Closed Store', 'CLOSED', [{ templateId: 1, order: 1 }]),
      makeStoreWithTemplates(2, 'Open Store Ranked', 'OPEN', [{ templateId: 1, order: 2 }]),
      makeStoreWithTemplates(3, 'Open Store Unranked', 'OPEN', [{ templateId: 1, order: 0 }]),
    ];
    const { service } = buildService(rows);

    const result = await service.findAll(
      { templateId: 1 } as any,
      true,
    );

    // Open stores come first (sorted by order: 2 then 3), closed store comes last (even with order 1)
    expect(result.map((s: any) => s.id)).toEqual([2, 3, 1]);
  });

  it('sorts by global storeOrder (> 0 first) when no templateId is provided', async () => {
    // Store 1: storeOrder 0
    // Store 2: storeOrder 3
    // Store 3: storeOrder 1
    const rows = [
      makeStoreWithTemplates(1, 'Store 1', 'OPEN', [], 0),
      makeStoreWithTemplates(2, 'Store 2', 'OPEN', [], 3),
      makeStoreWithTemplates(3, 'Store 3', 'OPEN', [], 1),
    ];
    const { service } = buildService(rows);

    const result = await service.findAll({} as any, true);

    // Expected: Store 3 (storeOrder 1), Store 2 (storeOrder 3), Store 1 (storeOrder 0 at the end)
    expect(result.map((s: any) => s.id)).toEqual([3, 2, 1]);
  });
});
