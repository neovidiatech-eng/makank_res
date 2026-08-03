// Unit tests for the Banner targeting + click-tracking additions. The service
// is constructed directly with a mocked PrismaService, so these run with no
// MySQL/Redis and no Nest DI boot. Paths that hit getBannerArgs are exercised
// with a single `id` filter so pagination short-circuits (no env() needed).
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BannerService } from '../banner.service';
import {
  getBannerArgs,
  selectBannerOBJ,
} from '../prisma-args/banner.prisma.args';

type AnyFn = jest.Mock;

const buildPrisma = () => ({
  banner: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  store: { findFirst: jest.fn() },
  category: { findFirst: jest.fn() },
  service: { findFirst: jest.fn() },
  branchZone: { findMany: jest.fn() },
});

const buildService = (prisma: ReturnType<typeof buildPrisma>) =>
  new BannerService(
    prisma as any,
    { getCashedLanguages: jest.fn().mockResolvedValue([]) } as any,
    {} as any,
  );

describe('BannerService — create targeting validation', () => {
  it('creates a banner with no targeting fields (backward compatible)', async () => {
    const prisma = buildPrisma();
    await buildService(prisma).create({
      name: { ar: 'بانر', en: 'Banner' },
      image: 'uploads/banner/x.jpg',
    } as any);

    expect(prisma.banner.create).toHaveBeenCalledTimes(1);
    const arg = (prisma.banner.create as AnyFn).mock.calls[0][0];
    expect(arg.data.Zones).toBeUndefined();
    expect(arg.data.name).toEqual({ ar: 'بانر', en: 'Banner' });
  });

  it('creates a banner targeting a store only', async () => {
    const prisma = buildPrisma();
    await buildService(prisma).create({
      name: { ar: 'بانر', en: 'Banner' },
      image: 'x.jpg',
      storeId: 1,
    } as any);

    expect(prisma.banner.create).toHaveBeenCalledTimes(1);
    // No category/service => store module is never loaded.
    expect(prisma.store.findFirst).not.toHaveBeenCalled();
  });

  it('creates store + category when the category belongs to the store', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue({ id: 1 });
    (prisma.category.findFirst as AnyFn).mockResolvedValue({
      id: 10,
      storeId: 1,
    });

    await buildService(prisma).create({
      name: { en: 'B' },
      image: 'x.jpg',
      storeId: 1,
      categoryId: 10,
    } as any);

    expect(prisma.banner.create).toHaveBeenCalledTimes(1);
  });

  it('creates the full hierarchy store + category + service', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue({ id: 1 });
    (prisma.category.findFirst as AnyFn).mockResolvedValue({
      id: 10,
      storeId: 1,
    });
    (prisma.service.findFirst as AnyFn).mockResolvedValue({
      id: 99,
      storeId: 1,
      categoryId: 10,
    });

    await buildService(prisma).create({
      name: { en: 'B' },
      image: 'x.jpg',
      storeId: 1,
      categoryId: 10,
      serviceId: 99,
    } as any);

    expect(prisma.banner.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a service that belongs to another store', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue({ id: 1 });
    (prisma.service.findFirst as AnyFn).mockResolvedValue({
      id: 99,
      storeId: 999,
      categoryId: 10,
    });

    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        storeId: 1,
        serviceId: 99,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.banner.create).not.toHaveBeenCalled();
  });

  it('rejects a service that belongs to another category', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue({ id: 1 });
    (prisma.category.findFirst as AnyFn).mockResolvedValue({
      id: 10,
      storeId: 1,
    });
    (prisma.service.findFirst as AnyFn).mockResolvedValue({
      id: 99,
      storeId: 1,
      categoryId: 77, // different category
    });

    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        storeId: 1,
        categoryId: 10,
        serviceId: 99,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a category from another store', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue({ id: 1 });
    (prisma.category.findFirst as AnyFn).mockResolvedValue({
      id: 10,
      storeId: 2,
    });

    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        storeId: 1,
        categoryId: 10,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a storeId when targeting a category', async () => {
    const prisma = buildPrisma();
    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        categoryId: 10,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BannerService — zone targeting', () => {
  it('creates a banner with multiple valid zones from the store branches', async () => {
    const prisma = buildPrisma();
    (prisma.branchZone.findMany as AnyFn).mockResolvedValue([
      { zoneId: 1 },
      { zoneId: 2 },
      { zoneId: 1 }, // duplicate from a second branch
    ]);

    await buildService(prisma).create({
      name: { en: 'B' },
      image: 'x.jpg',
      storeId: 1,
      zoneIds: [1, 2, 2], // duplicate input is normalized
    } as any);

    expect(prisma.banner.create).toHaveBeenCalledTimes(1);
    const arg = (prisma.banner.create as AnyFn).mock.calls[0][0];
    expect(arg.data.Zones.create).toEqual([{ zoneId: 1 }, { zoneId: 2 }]);
  });

  it('rejects a zone not linked to the store branches', async () => {
    const prisma = buildPrisma();
    (prisma.branchZone.findMany as AnyFn).mockResolvedValue([{ zoneId: 1 }]);

    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        storeId: 1,
        zoneIds: [1, 99],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.banner.create).not.toHaveBeenCalled();
  });

  it('rejects zones when the store has no branch-zone links', async () => {
    const prisma = buildPrisma();
    (prisma.branchZone.findMany as AnyFn).mockResolvedValue([]);

    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        storeId: 1,
        zoneIds: [1],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the allowed zones for a store (deduped) ', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue({ id: 1 });
    (prisma.branchZone.findMany as AnyFn).mockResolvedValue([
      { Zone: { id: 1, name: { en: 'Z1' } } },
      { Zone: { id: 2, name: { en: 'Z2' } } },
      { Zone: { id: 1, name: { en: 'Z1' } } },
    ]);

    const zones = await buildService(prisma).getAllowedZonesForStore(1);
    expect(zones).toEqual([
      { id: 1, name: { en: 'Z1' } },
      { id: 2, name: { en: 'Z2' } },
    ]);
  });

  it('404s allowed-zones for a missing store', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue(null);
    await expect(
      buildService(prisma).getAllowedZonesForStore(123),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BannerService — special-driver banner', () => {
  it('creates a special-driver banner without requiring store/category/service', async () => {
    const prisma = buildPrisma();
    await buildService(prisma).create({
      name: { ar: 'مندوب خاص', en: 'Special Driver' },
      image: 'x.jpg',
      targetType: 'SPECIAL_DRIVER',
    } as any);

    expect(prisma.banner.create).toHaveBeenCalledTimes(1);
    const arg = (prisma.banner.create as AnyFn).mock.calls[0][0];
    expect(arg.data.targetType).toBe('SPECIAL_DRIVER');
  });

  it('exposes isSpecialDriverBanner + targetType + zoneIds in responses', async () => {
    const prisma = buildPrisma();
    (prisma.banner.findFirst as AnyFn).mockResolvedValue({
      id: 7,
      name: { ar: 'مندوب خاص', en: 'Special Driver' },
      image: 'x.jpg',
      active: true,
      storeId: null,
      categoryId: null,
      serviceId: null,
      targetType: 'SPECIAL_DRIVER',
      clickCount: 0,
      Zones: [{ Zone: { id: 3, name: { en: 'Z3' } } }],
    });

    const res: any = await buildService(prisma).findAll(
      { id: 7 } as any,
      false,
    );
    expect(res.isSpecialDriverBanner).toBe(true);
    expect(res.targetType).toBe('SPECIAL_DRIVER');
    expect(res.zoneIds).toEqual([3]);
    expect(res.Zones).toEqual([{ id: 3, name: { en: 'Z3' } }]);
    // Legacy fields still intact.
    expect(res.id).toBe(7);
    expect(res.image).toBe('x.jpg');
  });
});

describe('BannerService — EXTERNAL_URL click action', () => {
  it('creates an EXTERNAL_URL banner with a clickUrl and no other targeting', async () => {
    const prisma = buildPrisma();
    await buildService(prisma).create({
      name: { ar: 'عرض خارجي', en: 'External offer' },
      image: 'x.jpg',
      targetType: 'EXTERNAL_URL',
      clickUrl: 'https://example.com/offer',
    } as any);

    expect(prisma.banner.create).toHaveBeenCalledTimes(1);
    const arg = (prisma.banner.create as AnyFn).mock.calls[0][0];
    expect(arg.data.targetType).toBe('EXTERNAL_URL');
    expect(arg.data.clickUrl).toBe('https://example.com/offer');
  });

  it('rejects EXTERNAL_URL without a clickUrl', async () => {
    const prisma = buildPrisma();
    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        targetType: 'EXTERNAL_URL',
      } as any),
    ).rejects.toThrow('EXTERNAL_URL banners require a clickUrl');
  });

  it('rejects EXTERNAL_URL combined with store targeting', async () => {
    const prisma = buildPrisma();
    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        targetType: 'EXTERNAL_URL',
        clickUrl: 'https://example.com',
        storeId: 1,
      } as any),
    ).rejects.toThrow(/EXTERNAL_URL banners must not include/);
  });

  it('rejects a clickUrl sent without targetType EXTERNAL_URL', async () => {
    const prisma = buildPrisma();
    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        clickUrl: 'https://example.com',
      } as any),
    ).rejects.toThrow('clickUrl is only allowed when targetType is EXTERNAL_URL');
  });

  it('rejects a non-http(s) clickUrl at the service layer (defense in depth)', async () => {
    const prisma = buildPrisma();
    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        targetType: 'EXTERNAL_URL',
        clickUrl: 'javascript:alert(1)',
      } as any),
    ).rejects.toThrow(/clickUrl must be/);
  });

  it('update() re-validates clickUrl against the effective (existing) targetType', async () => {
    const prisma = buildPrisma();
    (prisma.banner.findFirst as AnyFn).mockResolvedValue({
      id: 1,
      storeId: null,
      categoryId: null,
      serviceId: null,
      targetType: 'GENERAL',
      clickUrl: null,
      _count: { Zones: 0 },
    });

    await expect(
      buildService(prisma).update(1, {
        clickUrl: 'https://example.com',
      } as any),
    ).rejects.toThrow('clickUrl is only allowed when targetType is EXTERNAL_URL');
  });

  it('exposes clickUrl in the mapped response', async () => {
    const prisma = buildPrisma();
    (prisma.banner.findFirst as AnyFn).mockResolvedValue({
      id: 9,
      name: { en: 'External' },
      image: 'x.jpg',
      active: true,
      targetType: 'EXTERNAL_URL',
      clickUrl: 'https://example.com/offer',
      Zones: [],
    });

    const res: any = await buildService(prisma).findAll({ id: 9 } as any, false);
    expect(res.clickUrl).toBe('https://example.com/offer');
  });
});

describe('BannerService — click tracking + statistics', () => {
  it('increments clickCount atomically', async () => {
    const prisma = buildPrisma();
    (prisma.banner.findFirst as AnyFn).mockResolvedValue({ id: 1 });

    await buildService(prisma).trackClick(1);

    expect(prisma.banner.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { clickCount: { increment: 1 } },
    });
  });

  it('404s a click on a missing banner', async () => {
    const prisma = buildPrisma();
    (prisma.banner.findFirst as AnyFn).mockResolvedValue(null);

    await expect(buildService(prisma).trackClick(404)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.banner.update).not.toHaveBeenCalled();
  });

  it('returns banner name + clickCount from statistics', async () => {
    const prisma = buildPrisma();
    (prisma.banner.findFirst as AnyFn).mockResolvedValue({
      id: 1,
      name: { ar: 'مندوب خاص', en: 'Special Driver' },
      clickCount: 42,
    });

    const res: any = await buildService(prisma).statistics({ id: 1 } as any);
    expect(res).toEqual({
      id: 1,
      name: { ar: 'مندوب خاص', en: 'Special Driver' },
      clickCount: 42,
    });
  });
});

describe('BannerService — create scheduling/order passthrough', () => {
  it('persists order, startDate and endDate on create', async () => {
    const prisma = buildPrisma();
    const startDate = new Date('2026-06-01T00:00:00.000Z');
    const endDate = new Date('2026-06-30T23:59:59.000Z');

    await buildService(prisma).create({
      name: { en: 'B' },
      image: 'x.jpg',
      order: 5,
      startDate,
      endDate,
    } as any);

    const arg = (prisma.banner.create as AnyFn).mock.calls[0][0];
    expect(arg.data).toMatchObject({ order: 5, startDate, endDate });
  });
});

describe('getBannerArgs — ordering + scheduling', () => {
  it('customers: order asc then random tiebreaker, active + schedule window', () => {
    const args: any = getBannerArgs({ id: 1 } as any, [], true);

    expect(args.orderBy).toEqual([{ order: 'asc' }, { randomSeed: 'desc' }]);
    // active:true is enforced for customers
    expect(args.where.AND).toEqual(expect.arrayContaining([{ active: true }]));
    // a scheduling window (start/end OR-null) is injected
    const hasWindow = args.where.AND.some(
      (c: any) =>
        Array.isArray(c?.AND) &&
        c.AND.some((x: any) => x.OR?.some((o: any) => 'startDate' in o)),
    );
    expect(hasWindow).toBe(true);
  });

  it('admins: no forced active/window, deterministic default order', () => {
    const args: any = getBannerArgs({ id: 1 } as any, [], false);

    expect(args.orderBy).toEqual([{ order: 'asc' }, { id: 'desc' }]);
    expect(args.where.AND).not.toEqual(
      expect.arrayContaining([{ active: true }]),
    );
  });

  it('admins: orderBy is honoured when provided', () => {
    const args: any = getBannerArgs(
      { id: 1, orderBy: [{ clickCount: 'desc' }] } as any,
      [],
      false,
    );
    expect(args.orderBy).toEqual([{ clickCount: 'desc' }]);
  });
});

describe('BannerService — isCurrentlyActive (derived)', () => {
  const findOneWith = async (banner: any) => {
    const prisma = buildPrisma();
    (prisma.banner.findFirst as AnyFn).mockResolvedValue({
      id: 1,
      name: { en: 'B' },
      Zones: [],
      ...banner,
    });
    return (await buildService(prisma).findAll({ id: 1 } as any, false)) as any;
  };

  it('true for an active banner with open-ended window', async () => {
    const res = await findOneWith({
      active: true,
      startDate: null,
      endDate: null,
    });
    expect(res.isCurrentlyActive).toBe(true);
  });

  it('false before startDate', async () => {
    const res = await findOneWith({
      active: true,
      startDate: new Date(Date.now() + 86400000),
      endDate: null,
    });
    expect(res.isCurrentlyActive).toBe(false);
  });

  it('false after endDate', async () => {
    const res = await findOneWith({
      active: true,
      startDate: null,
      endDate: new Date(Date.now() - 86400000),
    });
    expect(res.isCurrentlyActive).toBe(false);
  });

  it('false when inactive regardless of window', async () => {
    const res = await findOneWith({
      active: false,
      startDate: null,
      endDate: null,
    });
    expect(res.isCurrentlyActive).toBe(false);
  });
});

// --- B1: FavoriteStore must never leak; only an isFavorite boolean ships -----
describe('BannerService — isFavorite (B1 favorite exposure)', () => {
  const findOneWithStore = async (store: any, userId?: number) => {
    const prisma = buildPrisma();
    (prisma.banner.findFirst as AnyFn).mockResolvedValue({
      id: 1,
      name: { en: 'B' },
      Zones: [],
      Store: store,
    });
    return (await buildService(prisma).findAll(
      { id: 1 } as any,
      true,
      userId ? ({ id: userId } as any) : undefined,
    )) as any;
  };

  it('collapses customer favorite rows to isFavorite=true and strips raw rows', async () => {
    const res = await findOneWithStore(
      { id: 9, name: { en: 'S' }, Favorites: [{ customerId: 5 }] },
      5,
    );
    expect(res.Store.isFavorite).toBe(true);
    expect(res.Store.Favorites).toBeUndefined();
  });

  it('isFavorite=false when the customer has no favorite row', async () => {
    const res = await findOneWithStore(
      { id: 9, name: { en: 'S' }, Favorites: [] },
      5,
    );
    expect(res.Store.isFavorite).toBe(false);
    expect(res.Store.Favorites).toBeUndefined();
  });

  it('isFavorite=false (and no Favorites) when there is no customer context', async () => {
    const res = await findOneWithStore({ id: 9, name: { en: 'S' } });
    expect(res.Store.isFavorite).toBe(false);
    expect(res.Store.Favorites).toBeUndefined();
  });

  it('select attaches the favorite relation ONLY for a real userId', () => {
    const customerSelect: any = selectBannerOBJ(5);
    expect(customerSelect.Store.select.Favorites).toEqual({
      where: { customerId: 5 },
      select: { customerId: true },
    });
    // Explicit Store select — never a broad include.
    expect(customerSelect.Store.include).toBeUndefined();

    const anonSelect: any = selectBannerOBJ(undefined);
    expect(anonSelect.Store.select.Favorites).toBeUndefined();
    expect(anonSelect.Store.include).toBeUndefined();
  });
});

// --- R1: targetType must agree with the targeting fields ---------------------
describe('BannerService — targetType consistency (R1)', () => {
  const createWith = (body: any) => buildService(buildPrisma()).create(body);

  it('STORE without storeId is rejected', async () => {
    await expect(
      createWith({ name: { en: 'B' }, image: 'x.jpg', targetType: 'STORE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('CATEGORY without categoryId is rejected', async () => {
    await expect(
      createWith({
        name: { en: 'B' },
        image: 'x.jpg',
        targetType: 'CATEGORY',
        storeId: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('SERVICE without categoryId is rejected', async () => {
    await expect(
      createWith({
        name: { en: 'B' },
        image: 'x.jpg',
        targetType: 'SERVICE',
        storeId: 1,
        serviceId: 99,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ZONE without zoneIds is rejected', async () => {
    await expect(
      createWith({
        name: { en: 'B' },
        image: 'x.jpg',
        targetType: 'ZONE',
        storeId: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('SPECIAL_DRIVER with targeting fields is rejected', async () => {
    await expect(
      createWith({
        name: { en: 'B' },
        image: 'x.jpg',
        targetType: 'SPECIAL_DRIVER',
        storeId: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('GENERAL with targeting fields is rejected', async () => {
    await expect(
      createWith({
        name: { en: 'B' },
        image: 'x.jpg',
        targetType: 'GENERAL',
        storeId: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('STORE with a storeId is accepted', async () => {
    const prisma = buildPrisma();
    await buildService(prisma).create({
      name: { en: 'B' },
      image: 'x.jpg',
      targetType: 'STORE',
      storeId: 1,
    } as any);
    expect(prisma.banner.create).toHaveBeenCalledTimes(1);
  });

  it('SPECIAL_DRIVER with no targeting is accepted', async () => {
    const prisma = buildPrisma();
    await buildService(prisma).create({
      name: { en: 'B' },
      image: 'x.jpg',
      targetType: 'SPECIAL_DRIVER',
    } as any);
    expect(prisma.banner.create).toHaveBeenCalledTimes(1);
  });

  it('omitted targetType keeps the legacy behaviour (store-only stays valid)', async () => {
    const prisma = buildPrisma();
    await buildService(prisma).create({
      name: { en: 'B' },
      image: 'x.jpg',
      storeId: 1,
    } as any);
    expect(prisma.banner.create).toHaveBeenCalledTimes(1);
  });

  it('update: changing targetType to ZONE without any zones is rejected', async () => {
    const prisma = buildPrisma();
    (prisma.banner.findFirst as AnyFn).mockResolvedValue({
      id: 1,
      storeId: 1,
      categoryId: null,
      serviceId: null,
      targetType: 'STORE',
      _count: { Zones: 0 },
    });
    await expect(
      buildService(prisma).update(1, { targetType: 'ZONE' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.banner.update).not.toHaveBeenCalled();
  });

  it('update: targetType ZONE stays valid when the banner already has zones', async () => {
    const prisma = buildPrisma();
    (prisma.banner.findFirst as AnyFn).mockResolvedValue({
      id: 1,
      storeId: 1,
      categoryId: null,
      serviceId: null,
      targetType: 'ZONE',
      _count: { Zones: 2 },
    });
    await buildService(prisma).update(1, { order: 3 } as any);
    expect(prisma.banner.update).toHaveBeenCalledTimes(1);
  });
});
