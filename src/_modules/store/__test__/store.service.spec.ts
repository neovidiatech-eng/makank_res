// Unit tests for template-driven store creation: store creation no longer
// resolves a Module; category inheritance is delegated to StoreTemplateService
// inside the same transaction.
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StoreService } from '../services/store.service';

type AnyFn = jest.Mock;

const buildTx = () => ({
  store: { create: jest.fn().mockResolvedValue({ id: 1 }) },
});

const buildPrisma = (tx = buildTx()) => ({
  storeTemplate: { findFirst: jest.fn() },
  city: { findMany: jest.fn().mockResolvedValue([]) },
  $transaction: jest.fn(async (cb: any) => cb(tx)),
});

const buildService = (
  prisma: ReturnType<typeof buildPrisma>,
  overrides: {
    settingService?: any;
    zoneService?: any;
    helpersService?: any;
    storeTemplateService?: any;
  } = {},
) =>
  new StoreService(
    prisma as any,
    {} as any,
    {} as any,
    overrides.settingService ??
      ({
        getSettings: jest.fn().mockResolvedValue({ filterByZone: false }),
      } as any),
    overrides.helpersService ??
      ({
        isUserExist: jest.fn().mockResolvedValue(null),
        createUser: jest.fn().mockResolvedValue({ id: 99 }),
      } as any),
    {} as any,
    overrides.zoneService ??
      ({ isPointInZone: jest.fn().mockResolvedValue(true) } as any),
    overrides.storeTemplateService ??
      ({ applyTemplateWithinTx: jest.fn() } as any),
    { sendLocalizedNotification: jest.fn() } as any,
    { hasValidDiscount: jest.fn().mockReturnValue(true) } as any,
  );

const baseBody = {
  name: { en: 'Store' },
  templateId: 5,
  logo: 'logo.png',
  cover: 'cover.png',
  lat: 30,
  lng: 31,
  address: 'addr',
  User: { name: 'u', email: 'u@a.com', phone: '0100', password: 'x' },
} as any;

const currentUser = { Role: { roleKey: 'CUSTOMER' } } as any;

describe('StoreService.create - template-driven store creation', () => {
  it('creates a module-free store and applies the template', async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    (prisma.storeTemplate.findFirst as AnyFn).mockResolvedValue({
      id: 5,
      active: true,
    });
    const applyTemplateWithinTx = jest.fn();

    await buildService(prisma, {
      storeTemplateService: { applyTemplateWithinTx },
    }).create(baseBody, currentUser);

    expect(tx.store.create).toHaveBeenCalledTimes(1);
    const arg = (tx.store.create as AnyFn).mock.calls[0][0];
    expect(arg.data.Module).toBeUndefined();
    expect(applyTemplateWithinTx).toHaveBeenCalledWith(tx, 1, 5);
  });

  it('rejects creation when the template is missing or inactive', async () => {
    const prisma = buildPrisma();
    (prisma.storeTemplate.findFirst as AnyFn).mockResolvedValue(null);

    await expect(
      buildService(prisma).create(baseBody, currentUser),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('StoreService.applyStoreDiscount', () => {
  it('resolves categoryId by querying the Category table for both ID and templateCategoryId', async () => {
    const tx = {
      service: { update: jest.fn() },
      serviceSize: { update: jest.fn() },
    };
    const prisma = {
      category: { findMany: jest.fn().mockResolvedValue([{ id: 640 }]) },
      service: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, price: 100, Sizes: [{ id: 10, price: 50 }] },
        ]),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    } as any;

    const service = buildService(prisma);
    const result = await service.applyStoreDiscount(112, 'PERCENTAGE' as any, 50, 9);

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { OR: [{ storeId: 112 }, { storeId: null }] },
          { OR: [{ id: 9 }, { templateCategoryId: 9 }] },
        ],
      },
      select: { id: true },
    });
    expect(prisma.service.findMany).toHaveBeenCalledWith({
      where: { storeId: 112, categoryId: { in: [640] } },
      include: {
        Sizes: {
          where: { deletedAt: null },
        },
      },
    });
    expect(tx.service.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { priceAfterDiscount: 50 },
    });
    expect(tx.serviceSize.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { priceAfterDiscount: 25 },
    });
    expect(result).toEqual({
      appliedCount: 2,
      skipped: [],
    });
  });
});

describe('StoreService.block', () => {
  it('deactivates branches and kills sessions when blocking a currently-unblocked store', async () => {
    const prisma = {
      store: {
        findUnique: jest.fn().mockResolvedValue({ id: 116, isBlocked: false }),
        update: jest.fn(),
      },
      branch: { updateMany: jest.fn() },
      session: { deleteMany: jest.fn() },
    } as any;

    await buildService(prisma).block(116);

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { User: { storeId: 116 } },
    });
    expect(prisma.branch.updateMany).toHaveBeenCalledWith({
      where: { storeId: 116 },
      data: { isActive: false },
    });
    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 116 },
      data: { isBlocked: true },
    });
  });

  it('reactivates branches when unblocking a currently-blocked store', async () => {
    const prisma = {
      store: {
        findUnique: jest.fn().mockResolvedValue({ id: 116, isBlocked: true }),
        update: jest.fn(),
      },
      branch: { updateMany: jest.fn() },
      session: { deleteMany: jest.fn() },
    } as any;

    await buildService(prisma).block(116);

    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    expect(prisma.branch.updateMany).toHaveBeenCalledWith({
      where: { storeId: 116 },
      data: { isActive: true },
    });
    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 116 },
      data: { isBlocked: false },
    });
  });
});

describe('StoreService.removeStoreDiscount', () => {
  it('resolves categoryId to clear discounts', async () => {
    const prisma = {
      category: { findMany: jest.fn().mockResolvedValue([{ id: 640 }]) },
      service: {
        findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
        updateMany: jest.fn(),
      },
      serviceSize: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (promises: any[]) => promises),
    } as any;

    const service = buildService(prisma);
    await service.removeStoreDiscount(112, 9);

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { OR: [{ storeId: 112 }, { storeId: null }] },
          { OR: [{ id: 9 }, { templateCategoryId: 9 }] },
        ],
      },
      select: { id: true },
    });
    expect(prisma.service.findMany).toHaveBeenCalledWith({
      where: { storeId: 112, categoryId: { in: [640] } },
      select: { id: true },
    });
  });
});

describe('StoreService.update — prepTimeMinutes / deliveryTime range', () => {
  const buildUpdatePrisma = () => {
    const tx = { store: { update: jest.fn() }, branch: { findFirst: jest.fn() } };
    return { $transaction: jest.fn(async (cb: any) => cb(tx)), __tx: tx };
  };

  it('persists prepTimeMinutes (store or admin can set it)', async () => {
    const prisma = buildUpdatePrisma();
    await buildService(prisma as any).update(1, { prepTimeMinutes: 20 } as any);

    expect(prisma.__tx.store.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { prepTimeMinutes: 20 } }),
    );
  });

  it('persists a valid delivery-time range', async () => {
    const prisma = buildUpdatePrisma();
    await buildService(prisma as any).update(1, {
      deliveryTimeMinMinutes: 15,
      deliveryTimeMaxMinutes: 25,
    } as any);

    expect(prisma.__tx.store.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { deliveryTimeMinMinutes: 15, deliveryTimeMaxMinutes: 25 },
      }),
    );
  });

  it('rejects a delivery-time range where max is less than min', async () => {
    const prisma = buildUpdatePrisma();

    await expect(
      buildService(prisma as any).update(1, {
        deliveryTimeMinMinutes: 30,
        deliveryTimeMaxMinutes: 10,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.__tx.store.update).not.toHaveBeenCalled();
  });
});

describe('StoreService — auto-derived cityId (no manual field, computed from location)', () => {
  const cairoCity = {
    id: 1,
    lat: 30.0444,
    lng: 31.2357,
    radius: 15,
    toleranceRadius: 5,
  };

  it('create() sets cityId from the main branch location when a city covers it', async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    (prisma.city.findMany as AnyFn).mockResolvedValue([cairoCity]);
    (prisma.storeTemplate.findFirst as AnyFn).mockResolvedValue({
      id: 5,
      active: true,
    });

    await buildService(prisma, {
      storeTemplateService: { applyTemplateWithinTx: jest.fn() },
    }).create({ ...baseBody, lat: 30.05, lng: 31.24 }, currentUser);

    const arg = (tx.store.create as AnyFn).mock.calls[0][0];
    expect(arg.data.cityId).toBe(1);
  });

  it('create() leaves cityId null when no active city covers the location', async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    (prisma.city.findMany as AnyFn).mockResolvedValue([]);
    (prisma.storeTemplate.findFirst as AnyFn).mockResolvedValue({
      id: 5,
      active: true,
    });

    await buildService(prisma).create(baseBody, currentUser);

    const arg = (tx.store.create as AnyFn).mock.calls[0][0];
    expect(arg.data.cityId).toBeNull();
  });

  it('update() recomputes cityId when lat/lng change', async () => {
    const tx = {
      store: { update: jest.fn() },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 9, closed: false, busyUntil: null }),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      city: { findMany: jest.fn().mockResolvedValue([cairoCity]) },
      branch: { findFirst: jest.fn().mockResolvedValue({ lat: 30.05, lng: 31.24 }) },
    };

    await buildService(prisma as any).update(1, { lat: 30.05, lng: 31.24 } as any);

    expect(tx.store.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cityId: 1 }) }),
    );
  });

  it('update() does not touch cityId when lat/lng are not part of the update', async () => {
    const tx = { store: { update: jest.fn() }, branch: { findFirst: jest.fn() } };
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      city: { findMany: jest.fn() },
      branch: { findFirst: jest.fn() },
    };

    await buildService(prisma as any).update(1, { prepTimeMinutes: 10 } as any);

    expect(prisma.city.findMany).not.toHaveBeenCalled();
    expect(tx.store.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { prepTimeMinutes: 10 } }),
    );
  });
});

describe('StoreService.updateBranchStatus — statusReason', () => {
  const buildStatusPrisma = (branch: any) => ({
    branch: {
      findFirst: jest.fn().mockResolvedValue(branch),
      update: jest.fn(),
    },
  });

  it('persists the reason when going CLOSED', async () => {
    const prisma = buildStatusPrisma({ id: 1, closed: false, statusReason: null });
    await buildService(prisma as any).updateBranchStatus(
      5,
      'CLOSED',
      undefined,
      'انقطاع كهرباء',
    );

    expect(prisma.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statusReason: 'انقطاع كهرباء' }),
      }),
    );
  });

  it('clears the reason when going back to NORMAL', async () => {
    const prisma = buildStatusPrisma({ id: 1, closed: true, statusReason: 'نفاد خامات' });
    await buildService(prisma as any).updateBranchStatus(5, 'NORMAL');

    expect(prisma.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statusReason: null }) }),
    );
  });
});

describe('StoreService.getEffectiveZonePrices — mobile sends the branch id, not the store id', () => {
  // The mobile app calls GET /stores/:id/effective-zone-prices with the
  // store's MAIN BRANCH id in some builds. This only ever "worked" by
  // coincidence for stores whose branch id happens to equal its own store
  // id (e.g. store 73 / branch 73) — any store where the two have diverged
  // (e.g. store 119 / branch 120) got a hard 404 with zero visible
  // difference in either record's own data.
  const buildZonePricesPrisma = (store: any, branch: any) => ({
    store: { findUnique: jest.fn().mockResolvedValue(store) },
    branch: { findUnique: jest.fn().mockResolvedValue(branch) },
    zone: { findMany: jest.fn().mockResolvedValue([]) },
  });

  it('resolves via the store id directly when it matches (unaffected — e.g. store 73 / branch 73)', async () => {
    const prisma = buildZonePricesPrisma({ id: 73 }, null);
    const zoneService = {
      getStoreZoneDeliveryPrice: jest.fn(),
      getZoneDeliveryPrice: jest.fn(),
    };

    await buildService(prisma as any, { zoneService }).getEffectiveZonePrices(73);

    expect(prisma.branch.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to resolving the id as a branch id when no store matches it', async () => {
    const prisma = buildZonePricesPrisma(null, { storeId: 119 });
    const zoneService = {
      getStoreZoneDeliveryPrice: jest.fn().mockResolvedValue(null),
      getZoneDeliveryPrice: jest.fn().mockResolvedValue(null),
    };
    (prisma.zone.findMany as jest.Mock).mockResolvedValue([
      { id: 1, name: { en: 'Zone A' }, cityId: null },
    ]);

    const result = await buildService(prisma as any, { zoneService }).getEffectiveZonePrices(
      120,
    );

    expect(prisma.branch.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 120 } }),
    );
    expect(zoneService.getStoreZoneDeliveryPrice).toHaveBeenCalledWith(119, 1);
    expect(result).toEqual([{ zoneId: 1, name: { en: 'Zone A' }, cityId: null, price: null }]);
  });

  it('still 404s when the id matches neither a store nor a branch', async () => {
    const prisma = buildZonePricesPrisma(null, null);
    const zoneService = {
      getStoreZoneDeliveryPrice: jest.fn(),
      getZoneDeliveryPrice: jest.fn(),
    };

    await expect(
      buildService(prisma as any, { zoneService }).getEffectiveZonePrices(9999),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StoreService.update — minOrderAmount', () => {
  const buildUpdatePrisma = () => {
    const tx = { store: { update: jest.fn() }, branch: { findFirst: jest.fn() } };
    return { $transaction: jest.fn(async (cb: any) => cb(tx)), __tx: tx };
  };

  it('persists minOrderAmount (store or admin can set it)', async () => {
    const prisma = buildUpdatePrisma();
    await buildService(prisma as any).update(1, { minOrderAmount: 50 } as any);

    expect(prisma.__tx.store.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { minOrderAmount: 50 } }),
    );
  });
});
