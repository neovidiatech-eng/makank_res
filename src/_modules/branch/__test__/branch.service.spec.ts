// Focused unit tests for the R2 fix: a non-existent zoneId in branch
// create/update must return a clean 400 (BadRequestException) instead of
// slipping past the shared @ValidateExist array validator and surfacing as a
// Prisma FK 500 on the nested BranchZones.create. Constructed with mocked
// dependencies — no MySQL/Redis/Nest DI boot.
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BranchService } from '../services/branch.service';

type AnyFn = jest.Mock;

const buildPrisma = () => ({
  branch: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  zone: { findMany: jest.fn() },
});

const buildService = (prisma: ReturnType<typeof buildPrisma>) =>
  new BranchService(
    prisma as any,
    { getCashedLanguages: jest.fn().mockResolvedValue([]) } as any,
    {
      getSettings: jest.fn().mockResolvedValue({ filterByZone: false }),
    } as any,
    { isPointInZone: jest.fn().mockResolvedValue(true) } as any,
  );

const baseBranch = {
  name: { en: 'B' },
  phone: '01000000000',
  address: 'addr',
  lat: 30,
  lng: 31,
  isActive: true,
};

describe('BranchService — zoneIds existence (R2)', () => {
  it('create: rejects a non-existent zoneId with 400 (no FK 500)', async () => {
    const prisma = buildPrisma();
    // Only zone 1 exists; 99 is missing.
    (prisma.zone.findMany as AnyFn).mockResolvedValue([{ id: 1 }]);

    await expect(
      buildService(prisma).create({
        ...baseBranch,
        storeId: 1,
        zoneIds: [1, 99],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.branch.create).not.toHaveBeenCalled();
  });

  it('update: rejects a non-existent zoneId with 400 before touching the branch', async () => {
    const prisma = buildPrisma();
    (prisma.zone.findMany as AnyFn).mockResolvedValue([]);

    await expect(
      buildService(prisma).update(7, { zoneIds: [42] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.branch.findUnique).not.toHaveBeenCalled();
    expect(prisma.branch.update).not.toHaveBeenCalled();
  });

  it('create: passes existence check when all zoneIds exist', async () => {
    const prisma = buildPrisma();
    (prisma.zone.findMany as AnyFn).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    (prisma.branch.create as AnyFn).mockResolvedValue({ id: 100 });

    await buildService(prisma).create({
      ...baseBranch,
      storeId: 1,
      zoneIds: [1, 2],
    } as any);

    expect(prisma.branch.create).toHaveBeenCalledTimes(1);
  });

  it('create: no zone lookup when zoneIds is omitted (backward compatible)', async () => {
    const prisma = buildPrisma();
    (prisma.branch.create as AnyFn).mockResolvedValue({ id: 100 });

    await buildService(prisma).create({ ...baseBranch, storeId: 1 } as any);

    expect(prisma.zone.findMany).not.toHaveBeenCalled();
    expect(prisma.branch.create).toHaveBeenCalledTimes(1);
  });

  it('update: still 404s a missing branch (existing zone list)', async () => {
    const prisma = buildPrisma();
    (prisma.zone.findMany as AnyFn).mockResolvedValue([{ id: 1 }]);
    (prisma.branch.findUnique as AnyFn).mockResolvedValue(null);

    await expect(
      buildService(prisma).update(404, { zoneIds: [1] } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BranchService — every branch unconditionally shows every active zone', () => {
  // BranchZone coverage used to be opt-in, which produced an inconsistent
  // picture across restaurants: an explicit row pointing at a since-deleted/
  // deactivated zone still slipped past an "is BranchZones empty" check
  // (the array wasn't empty, it just had unusable entries) — so the
  // delivery-zone picker was empty/broken for some restaurants and fine for
  // others with no visible reason. Per product decision, BranchZone
  // configuration is no longer consulted at all for this: every branch
  // always gets every active zone.
  it('findOne: always returns every active zone, regardless of any BranchZone rows', async () => {
    const prisma = buildPrisma();
    (prisma.branch.findFirst as AnyFn).mockResolvedValue({
      id: 5,
      // Has SOME explicit (possibly stale/dangling) rows already — must be
      // fully replaced, not merged or left alone.
      BranchZones: [{ Zone: { id: 9, name: { en: 'Only This One' } } }],
      storeSchedule: [],
    });
    (prisma.zone.findMany as AnyFn).mockResolvedValue([
      { id: 1, name: { en: 'Zone A' } },
      { id: 2, name: { en: 'Zone B' } },
    ]);

    const result = await buildService(prisma).findOne(5);

    expect(result.BranchZones).toEqual([
      { Zone: { id: 1, name: { en: 'Zone A' } } },
      { Zone: { id: 2, name: { en: 'Zone B' } } },
    ]);
  });

  it('findAll (list mode): every branch gets the same full zone list, only querying zones once', async () => {
    const prisma = buildPrisma();
    (prisma.branch.findMany as AnyFn).mockResolvedValue([
      { id: 1, BranchZones: [], storeSchedule: [] },
      {
        id: 2,
        BranchZones: [{ Zone: { id: 7, name: { en: 'Configured' } } }],
        storeSchedule: [],
      },
    ]);
    (prisma.zone.findMany as AnyFn).mockResolvedValue([
      { id: 1, name: { en: 'Zone A' } },
    ]);

    const result = await buildService(prisma).findAll({} as any);

    expect(result[0].BranchZones).toEqual([
      { Zone: { id: 1, name: { en: 'Zone A' } } },
    ]);
    expect(result[1].BranchZones).toEqual([
      { Zone: { id: 1, name: { en: 'Zone A' } } },
    ]);
    expect(prisma.zone.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('BranchService.updateStatus — statusReason (customer-facing "stopped taking orders" message)', () => {
  it('persists the reason when going BUSY', async () => {
    const prisma = buildPrisma();
    (prisma.branch.findFirst as AnyFn).mockResolvedValue({
      id: 1,
      closed: false,
      statusReason: null,
    });

    await buildService(prisma).updateStatus(1, 'BUSY', 15, 'ضغط طلبات');

    expect(prisma.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statusReason: 'ضغط طلبات' }),
      }),
    );
  });

  it('clears the reason once the branch goes back OPEN', async () => {
    const prisma = buildPrisma();
    (prisma.branch.findFirst as AnyFn).mockResolvedValue({
      id: 1,
      closed: true,
      statusReason: 'انقطاع كهرباء',
    });

    await buildService(prisma).updateStatus(1, 'OPEN');

    expect(prisma.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statusReason: null }) }),
    );
  });

  it('keeps the previous reason if BUSY/CLOSED is re-sent without a new one', async () => {
    const prisma = buildPrisma();
    (prisma.branch.findFirst as AnyFn).mockResolvedValue({
      id: 1,
      closed: true,
      statusReason: 'نفاد خامات',
    });

    await buildService(prisma).updateStatus(1, 'CLOSED');

    expect(prisma.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statusReason: 'نفاد خامات' }),
      }),
    );
  });
});
