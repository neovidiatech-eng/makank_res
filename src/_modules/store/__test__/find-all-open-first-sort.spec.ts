// StoreService.findAll — the customer/visitor browse listing pushes
// busy/closed stores below open ones. Whether a branch is genuinely open
// depends on live status/busyUntil, not a plain sortable DB column, so the
// query can't just ORDER BY it — the sort has to run in JS on the FULL
// matching set, with pagination applied afterward, or a page boundary could
// strand an open store behind a closed one that only ranked first by
// storeOrder/id. The admin dashboard listing (not customer/visitor) must be
// completely unaffected — same DB order, same DB-level pagination.
import { StoreService } from '../services/store.service';

const makeStore = (id: number, name: string, branchStatus: string) => ({
  id,
  name,
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
});

const buildService = (storeRows: any[]) => {
  const prisma = {
    store: { findMany: jest.fn().mockResolvedValue(storeRows) },
    coupon: { findMany: jest.fn().mockResolvedValue([]) },
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
    undefined as any, // helpersService
    mapService as any,
    undefined as any, // zoneService
    undefined as any, // storeTemplateService
    undefined as any, // notificationService
    serviceModuleHelper as any,
  );
  return { service, prisma };
};

describe('StoreService.findAll — open/busy/closed ordering', () => {
  it('pushes busy and closed stores below open ones for a customer/visitor browse', async () => {
    const rows = [
      makeStore(1, 'Closed Restaurant', 'CLOSED'),
      makeStore(2, 'Open Restaurant A', 'OPEN'),
      makeStore(3, 'Busy Restaurant', 'BUSY'),
      makeStore(4, 'Open Restaurant B', 'OPEN'),
    ];
    const { service } = buildService(rows);

    const result = await service.findAll({} as any, true /* isVisitor */);

    expect(result.map((s: any) => s.id)).toEqual([2, 4, 1, 3]);
  });

  it('paginates AFTER sorting, so an open store on a later DB page still lands on page 1', async () => {
    const rows = [
      makeStore(1, 'Closed Restaurant', 'CLOSED'),
      makeStore(2, 'Busy Restaurant', 'BUSY'),
      makeStore(3, 'Open Restaurant', 'OPEN'),
    ];
    const { service } = buildService(rows);

    const page1 = await service.findAll(
      { limit: 2, page: 1 } as any,
      true,
    );
    const page2 = await service.findAll(
      { limit: 2, page: 2 } as any,
      true,
    );

    // The open store (id 3) is last in DB order but must win page 1 —
    // a plain DB-level LIMIT/OFFSET (page 1 = rows 1-2) would have
    // stranded it on page 2 behind the two closed/busy ones.
    expect(page1.map((s: any) => s.id)).toEqual([3, 1]);
    expect(page2.map((s: any) => s.id)).toEqual([2]);
  });

  it('does not reorder or re-paginate the admin dashboard listing', async () => {
    const rows = [
      makeStore(1, 'Closed Restaurant', 'CLOSED'),
      makeStore(2, 'Open Restaurant', 'OPEN'),
    ];
    const { service, prisma } = buildService(rows);

    // No customerId, isVisitor=false → admin/dashboard call.
    const result = await service.findAll({} as any, false);

    expect(result.map((s: any) => s.id)).toEqual([1, 2]); // untouched DB order
    expect(prisma.store.findMany).toHaveBeenCalled();
  });
});
