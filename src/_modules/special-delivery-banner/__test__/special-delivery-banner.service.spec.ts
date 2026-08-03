// SpecialDeliveryBannerService — a straight clone of BannerService (see
// src/_modules/banner/__test__/banner.service.spec.ts for the original,
// exhaustively-tested logic this mirrors). These tests exist to catch
// mechanical cloning mistakes (wrong Prisma model name, wrong field, wrong
// import) rather than re-litigate business rules already proven correct in
// the original feature.
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SpecialDeliveryBannerService } from '../special-delivery-banner.service';

type AnyFn = jest.Mock;

const buildPrisma = () => ({
  specialDeliveryBanner: {
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
  new SpecialDeliveryBannerService(
    prisma as any,
    { getCashedLanguages: jest.fn().mockResolvedValue([]) } as any,
    {} as any,
  );

describe('SpecialDeliveryBannerService.create — targeting validation', () => {
  it('creates a banner with no targeting fields (GENERAL)', async () => {
    const prisma = buildPrisma();
    await buildService(prisma).create({
      name: { ar: 'بانر', en: 'Banner' },
      image: 'uploads/special-delivery-banner/x.jpg',
    } as any);

    expect(prisma.specialDeliveryBanner.create).toHaveBeenCalledTimes(1);
    const arg = (prisma.specialDeliveryBanner.create as AnyFn).mock.calls[0][0];
    expect(arg.data.Zones).toBeUndefined();
    expect(arg.data.name).toEqual({ ar: 'بانر', en: 'Banner' });
  });

  it('creates the full hierarchy store + category + service', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue({ id: 1 });
    (prisma.category.findFirst as AnyFn).mockResolvedValue({ id: 10, storeId: 1 });
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

    expect(prisma.specialDeliveryBanner.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a category that does not belong to the given store', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue({ id: 1 });
    (prisma.category.findFirst as AnyFn).mockResolvedValue({ id: 10, storeId: 2 });

    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        storeId: 1,
        categoryId: 10,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.specialDeliveryBanner.create).not.toHaveBeenCalled();
  });

  it('rejects targetType STORE without a storeId', async () => {
    const prisma = buildPrisma();
    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        targetType: 'STORE',
      } as any),
    ).rejects.toThrow('STORE banners require a storeId');
  });

  it('rejects GENERAL with targeting fields attached', async () => {
    const prisma = buildPrisma();
    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        targetType: 'GENERAL',
        storeId: 1,
      } as any),
    ).rejects.toThrow(/GENERAL banners must not include/);
  });

  it('creates zone links only when the zones are linked to the store', async () => {
    const prisma = buildPrisma();
    (prisma.branchZone.findMany as AnyFn).mockResolvedValue([
      { Zone: { id: 5, name: {} }, zoneId: 5 },
    ]);

    await buildService(prisma).create({
      name: { en: 'B' },
      image: 'x.jpg',
      storeId: 1,
      zoneIds: [5],
    } as any);

    const arg = (prisma.specialDeliveryBanner.create as AnyFn).mock.calls[0][0];
    expect(arg.data.Zones).toEqual({ create: [{ zoneId: 5 }] });
  });

  it('rejects a zone not linked to the store branches', async () => {
    const prisma = buildPrisma();
    (prisma.branchZone.findMany as AnyFn).mockResolvedValue([
      { zoneId: 5 },
    ]);

    await expect(
      buildService(prisma).create({
        name: { en: 'B' },
        image: 'x.jpg',
        storeId: 1,
        zoneIds: [7],
      } as any),
    ).rejects.toThrow(/not linked to the selected store/);
  });
});

describe('SpecialDeliveryBannerService.update', () => {
  it('validates against the existing storeId when only zoneIds are sent', async () => {
    const prisma = buildPrisma();
    (prisma.specialDeliveryBanner.findFirst as AnyFn).mockResolvedValue({
      id: 1,
      storeId: 1,
      categoryId: null,
      serviceId: null,
      targetType: 'ZONE',
      _count: { Zones: 1 },
    });
    (prisma.branchZone.findMany as AnyFn).mockResolvedValue([{ zoneId: 5 }]);

    await buildService(prisma).update(1, { zoneIds: [5] } as any);

    expect(prisma.specialDeliveryBanner.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        Zones: { deleteMany: {}, create: [{ zoneId: 5 }] },
      },
    });
  });

  it('throws NotFoundException for a missing/deleted banner', async () => {
    const prisma = buildPrisma();
    (prisma.specialDeliveryBanner.findFirst as AnyFn).mockResolvedValue(null);

    await expect(
      buildService(prisma).update(999, { name: { en: 'x' } } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clears zone links when zoneIds is sent as an empty array', async () => {
    const prisma = buildPrisma();
    (prisma.specialDeliveryBanner.findFirst as AnyFn).mockResolvedValue({
      id: 1,
      storeId: 1,
      categoryId: null,
      serviceId: null,
      targetType: null,
      _count: { Zones: 2 },
    });

    await buildService(prisma).update(1, { zoneIds: [] } as any);

    expect(prisma.specialDeliveryBanner.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { Zones: { deleteMany: {}, create: [] } },
    });
  });
});

describe('SpecialDeliveryBannerService.findAll', () => {
  it('scopes to active + in-schedule-window banners for a customer, and maps the response', async () => {
    const prisma = buildPrisma();
    (prisma.specialDeliveryBanner.findMany as AnyFn).mockResolvedValue([
      {
        id: 1,
        targetType: 'GENERAL',
        active: true,
        startDate: null,
        endDate: null,
        Zones: [{ Zone: { id: 5, name: {} } }],
        Store: null,
      },
    ]);

    const result = await buildService(prisma).findAll({} as any, true);

    expect(prisma.specialDeliveryBanner.findMany).toHaveBeenCalled();
    const args = (prisma.specialDeliveryBanner.findMany as AnyFn).mock.calls[0][0];
    expect(JSON.stringify(args.where)).toContain('"active":true');
    expect(result[0]).toMatchObject({
      zoneIds: [5],
      isSpecialDriverBanner: false,
      isCurrentlyActive: true,
    });
  });

  it('does not force active/schedule filtering for the admin dashboard', async () => {
    const prisma = buildPrisma();
    (prisma.specialDeliveryBanner.findMany as AnyFn).mockResolvedValue([]);

    await buildService(prisma).findAll({} as any, false);

    const args = (prisma.specialDeliveryBanner.findMany as AnyFn).mock.calls[0][0];
    expect(JSON.stringify(args.where)).not.toContain('"active":true');
  });
});

describe('SpecialDeliveryBannerService.trackClick', () => {
  it('404s when the banner does not exist', async () => {
    const prisma = buildPrisma();
    (prisma.specialDeliveryBanner.findFirst as AnyFn).mockResolvedValue(null);

    await expect(buildService(prisma).trackClick(1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.specialDeliveryBanner.update).not.toHaveBeenCalled();
  });

  it('increments clickCount, swallowing an increment failure', async () => {
    const prisma = buildPrisma();
    (prisma.specialDeliveryBanner.findFirst as AnyFn).mockResolvedValue({ id: 1 });
    (prisma.specialDeliveryBanner.update as AnyFn).mockRejectedValue(new Error('db down'));

    await expect(buildService(prisma).trackClick(1)).resolves.toBeUndefined();
    expect(prisma.specialDeliveryBanner.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { clickCount: { increment: 1 } },
    });
  });
});

describe('SpecialDeliveryBannerService.getAllowedZonesForStore', () => {
  it('throws NotFoundException for a missing store', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue(null);

    await expect(
      buildService(prisma).getAllowedZonesForStore(1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dedupes zones shared by multiple branches', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue({ id: 1 });
    (prisma.branchZone.findMany as AnyFn).mockResolvedValue([
      { Zone: { id: 5, name: {} } },
      { Zone: { id: 5, name: {} } },
      { Zone: { id: 7, name: {} } },
    ]);

    const zones = await buildService(prisma).getAllowedZonesForStore(1);
    expect(zones).toHaveLength(2);
    expect(zones.map((z) => z.id).sort()).toEqual([5, 7]);
  });
});
