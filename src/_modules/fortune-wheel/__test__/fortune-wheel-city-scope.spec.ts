import { BadRequestException } from '@nestjs/common';
import { FortuneWheelRewardType } from '@prisma/client';
import { FortuneWheelService } from '../fortune-wheel.service';

const makeItem = (overrides = {}) => ({
  id: 1,
  displayName: 'خصم 10%',
  rewardType: FortuneWheelRewardType.DISCOUNT,
  rewardValue: 10,
  weight: 1,
  maxDiscount: null,
  minOrderAmount: null,
  maxOrderAmount: null,
  rewardExpiryHours: 24,
  storeId: null,
  cityId: 1,
  isActive: true,
  deletedAt: null,
  Store: null,
  City: { id: 1, name: 'المحلة الكبرى' },
  ...overrides,
});

describe('FortuneWheelService - City Scoping', () => {
  it('passes cityId to findMany in getEligibility', async () => {
    const itemMahalla = makeItem({ id: 101, cityId: 1 });
    const prisma = {
      fortuneWheelSettings: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, isEnabled: true, displayIntervalHours: 24 }),
      },
      fortuneWheelItem: {
        findMany: jest.fn().mockResolvedValue([itemMahalla]),
      },
      fortuneWheelUserState: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new FortuneWheelService(prisma as any);
    const result = await service.getEligibility(1, { cityId: 1 });

    expect(prisma.fortuneWheelItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cityId: 1,
          isActive: true,
          deletedAt: null,
        }),
      }),
    );
    expect(result.shouldShow).toBe(true);
    expect(result.items.length).toBe(1);
  });

  it('filters items for Tanta when cityId=2 is queried', async () => {
    const itemTanta = makeItem({ id: 201, cityId: 2, Store: { id: 204, cityId: 2 } });
    const prisma = {
      fortuneWheelSettings: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, isEnabled: true, displayIntervalHours: 24 }),
      },
      fortuneWheelItem: {
        findMany: jest.fn().mockResolvedValue([itemTanta]),
      },
      fortuneWheelUserState: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new FortuneWheelService(prisma as any);
    const result = await service.getEligibility(1, { cityId: 2 });

    expect(prisma.fortuneWheelItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cityId: 2,
        }),
      }),
    );
    expect(result.shouldShow).toBe(true);
  });

  it('inherits store.cityId automatically in create when cityId is omitted', async () => {
    const prisma = {
      store: {
        findUnique: jest.fn().mockResolvedValue({ id: 50, cityId: 2 }),
      },
      fortuneWheelItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };

    const service = new FortuneWheelService(prisma as any);
    await service.create({
      displayName: 'وجبة مجانية من كنتاكي',
      rewardType: FortuneWheelRewardType.FREE_DELIVERY,
      storeId: 50,
    });

    expect(prisma.store.findUnique).toHaveBeenCalledWith({
      where: { id: 50 },
      select: { cityId: true },
    });
    expect(prisma.fortuneWheelItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 50,
        cityId: 2,
      }),
    });
  });

  it('throws BadRequestException when store.cityId does not match provided cityId', async () => {
    const prisma = {
      store: {
        findUnique: jest.fn().mockResolvedValue({ id: 50, cityId: 1 }), // Mahalla store
      },
    };

    const service = new FortuneWheelService(prisma as any);
    await expect(
      service.create({
        displayName: 'عرض طنطا',
        rewardType: FortuneWheelRewardType.FREE_DELIVERY,
        storeId: 50,
        cityId: 2, // Mismatched Tanta cityId
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('scopes spin() to cityId and saves cityId on user reward', async () => {
    const itemMahalla = makeItem({ id: 101, cityId: 1 });
    const createdReward = { id: 88, userId: 1, itemId: 101, cityId: 1 };

    const tx = {
      fortuneWheelSettings: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, isEnabled: true, displayIntervalHours: 24 }),
      },
      fortuneWheelItem: {
        findMany: jest.fn().mockResolvedValue([itemMahalla]),
      },
      fortuneWheelUserState: {
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      fortuneWheelUserReward: {
        create: jest.fn().mockResolvedValue(createdReward),
      },
    };

    const prisma = {
      $transaction: jest.fn((cb) => cb(tx)),
    };

    const service = new FortuneWheelService(prisma as any);
    const result = await service.spin(1, { cityId: 1 });

    expect(tx.fortuneWheelItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cityId: 1,
        }),
      }),
    );
    expect(tx.fortuneWheelUserReward.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cityId: 1,
        }),
      }),
    );
    expect(result.isWin).toBe(true);
    expect(result.wonItem.cityId).toBe(1);
  });
});
