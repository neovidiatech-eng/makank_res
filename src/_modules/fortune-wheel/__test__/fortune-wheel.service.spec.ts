import {
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { FortuneWheelRewardType } from "@prisma/client";
import { FortuneWheelService } from "../fortune-wheel.service";

const buildPrisma = (overrides: Record<string, any> = {}) => ({
  fortuneWheelSettings: {
    findFirst: jest.fn().mockResolvedValue({ id: 1, isEnabled: true, displayIntervalHours: 24 }),
    create: jest.fn(),
    update: jest.fn(),
  },
  fortuneWheelItem: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirstOrThrow: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
  },
  fortuneWheelUserState: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  fortuneWheelUserReward: {
    create: jest.fn().mockResolvedValue({ id: 99, storeId: null, Store: null, expiresAt: null }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  $transaction: jest.fn(),
  ...overrides,
});

const makeItem = (overrides: Partial<any> = {}): any => ({
  id: 1,
  displayName: { ar: "discount", en: "Discount" },
  rewardType: FortuneWheelRewardType.DISCOUNT,
  rewardValue: 20,
  weight: 10,
  maxDiscount: null,
  minOrderAmount: null,
  maxOrderAmount: null,
  rewardExpiryHours: 48,
  storeId: null,
  Store: null,
  isActive: true,
  deletedAt: null,
  ...overrides,
});

const buildTxFromItem = (item: any, txOverrides: any = {}) => ({
  fortuneWheelSettings: {
    findFirst: jest.fn().mockResolvedValue({ id: 1, isEnabled: true, displayIntervalHours: 24 }),
  },
  fortuneWheelItem: { findMany: jest.fn().mockResolvedValue([item]) },
  fortuneWheelUserState: {
    create: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  fortuneWheelUserReward: {
    create: jest.fn().mockResolvedValue({ id: 99, storeId: item.storeId, Store: item.Store, expiresAt: null }),
  },
  ...txOverrides,
});

describe("FortuneWheelService", () => {

  describe("getEligibility()", () => {
    it("returns shouldShow=false when wheel is disabled", async () => {
      const prisma = buildPrisma({
        fortuneWheelSettings: {
          findFirst: jest.fn().mockResolvedValue({ id: 1, isEnabled: false, displayIntervalHours: 24 }),
          create: jest.fn(), update: jest.fn(),
        },
      });
      const service = new FortuneWheelService(prisma as any);
      const result = await service.getEligibility(1);
      expect(result.shouldShow).toBe(false);
      expect(result.items).toEqual([]);
    });

    it("returns shouldShow=false when no active items", async () => {
      const prisma = buildPrisma();
      const service = new FortuneWheelService(prisma as any);
      const result = await service.getEligibility(1);
      expect(result.shouldShow).toBe(false);
    });

    it("returns shouldShow=true for eligible user with items", async () => {
      const prisma = buildPrisma({
        fortuneWheelItem: {
          findMany: jest.fn().mockResolvedValue([makeItem()]),
          findFirstOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(),
          delete: jest.fn(), count: jest.fn(), aggregate: jest.fn(),
        },
        fortuneWheelUserState: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(), upsert: jest.fn(), updateMany: jest.fn(),
        },
      });
      const service = new FortuneWheelService(prisma as any);
      const result = await service.getEligibility(1);
      expect(result.shouldShow).toBe(true);
      expect(result.items.length).toBe(1);
    });

    it("returns shouldShow=false when nextEligibleAt is in the future", async () => {
      const future = new Date(Date.now() + 10 * 60 * 60 * 1000);
      const prisma = buildPrisma({
        fortuneWheelItem: {
          findMany: jest.fn().mockResolvedValue([makeItem()]),
          findFirstOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(),
          delete: jest.fn(), count: jest.fn(), aggregate: jest.fn(),
        },
        fortuneWheelUserState: {
          findUnique: jest.fn().mockResolvedValue({ nextEligibleAt: future }),
          create: jest.fn(), upsert: jest.fn(), updateMany: jest.fn(),
        },
      });
      const service = new FortuneWheelService(prisma as any);
      const result = await service.getEligibility(1);
      expect(result.shouldShow).toBe(false);
      expect(result.nextEligibleAt).toEqual(future);
    });
  });

  describe("spin()", () => {
    it("throws BadRequestException when wheel is disabled", async () => {
      const prisma = buildPrisma();
      prisma.$transaction = jest.fn((fn: any) => fn({
        fortuneWheelSettings: { findFirst: jest.fn().mockResolvedValue({ id: 1, isEnabled: false, displayIntervalHours: 24 }) },
        fortuneWheelItem: { findMany: jest.fn().mockResolvedValue([makeItem()]) },
        fortuneWheelUserState: { create: jest.fn(), updateMany: jest.fn() },
        fortuneWheelUserReward: { create: jest.fn() },
      }));
      const service = new FortuneWheelService(prisma as any);
      await expect(service.spin(1)).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when no active items", async () => {
      const prisma = buildPrisma();
      prisma.$transaction = jest.fn((fn: any) => fn({
        fortuneWheelSettings: { findFirst: jest.fn().mockResolvedValue({ id: 1, isEnabled: true, displayIntervalHours: 24 }) },
        fortuneWheelItem: { findMany: jest.fn().mockResolvedValue([]) },
        fortuneWheelUserState: { create: jest.fn(), updateMany: jest.fn() },
        fortuneWheelUserReward: { create: jest.fn() },
      }));
      const service = new FortuneWheelService(prisma as any);
      await expect(service.spin(1)).rejects.toThrow(BadRequestException);
    });

    it("throws ConflictException when user not yet eligible", async () => {
      const item = makeItem();
      const prisma = buildPrisma();
      prisma.$transaction = jest.fn((fn: any) => fn({
        ...buildTxFromItem(item),
        fortuneWheelUserState: { create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      }));
      const service = new FortuneWheelService(prisma as any);
      await expect(service.spin(1)).rejects.toThrow(ConflictException);
    });

    it("returns isWin=false for NONE reward type", async () => {
      const item = makeItem({ rewardType: FortuneWheelRewardType.NONE, rewardValue: null });
      const prisma = buildPrisma();
      prisma.$transaction = jest.fn((fn: any) => fn(buildTxFromItem(item)));
      const service = new FortuneWheelService(prisma as any);
      const result = await service.spin(1);
      expect(result.isWin).toBe(false);
      expect(result.reward).toBeNull();
    });

    it("returns isWin=true with DISCOUNT reward", async () => {
      const item = makeItem({ rewardType: FortuneWheelRewardType.DISCOUNT, rewardValue: 20 });
      const prisma = buildPrisma();
      prisma.$transaction = jest.fn((fn: any) => fn(buildTxFromItem(item)));
      const service = new FortuneWheelService(prisma as any);
      const result = await service.spin(1);
      expect(result.isWin).toBe(true);
      expect(result.wonItem.rewardType).toBe(FortuneWheelRewardType.DISCOUNT);
      expect(result.wonItem.rewardValue).toBe(20);
    });

    it("returns isWin=true with FREE_DELIVERY reward", async () => {
      const item = makeItem({ rewardType: FortuneWheelRewardType.FREE_DELIVERY, rewardValue: null });
      const prisma = buildPrisma();
      prisma.$transaction = jest.fn((fn: any) => fn(buildTxFromItem(item)));
      const service = new FortuneWheelService(prisma as any);
      const result = await service.spin(1);
      expect(result.isWin).toBe(true);
      expect(result.wonItem.rewardType).toBe(FortuneWheelRewardType.FREE_DELIVERY);
    });

    it("attaches storeId and Store for store-specific item", async () => {
      const store = { id: 5, name: "Test Restaurant", logo: "logo.png" };
      const item = makeItem({ storeId: 5, Store: store });
      const prisma = buildPrisma();
      prisma.$transaction = jest.fn((fn: any) => fn(buildTxFromItem(item)));
      const service = new FortuneWheelService(prisma as any);
      const result = await service.spin(1);
      expect(result.wonItem.storeId).toBe(5);
      expect(result.wonItem.Store).toEqual(store);
      expect(result.reward.storeId).toBe(5);
    });

    it("returns isWin=true with FIXED_AMOUNT reward", async () => {
      const item = makeItem({ rewardType: FortuneWheelRewardType.FIXED_AMOUNT, rewardValue: 30 });
      const prisma = buildPrisma();
      prisma.$transaction = jest.fn((fn: any) => fn(buildTxFromItem(item)));
      const service = new FortuneWheelService(prisma as any);
      const result = await service.spin(1);
      expect(result.isWin).toBe(true);
      expect(result.wonItem.rewardValue).toBe(30);
    });
  });

  describe("create() - validateItemPayload()", () => {
    const baseCreate = (overrides: any) =>
      ({ displayName: { ar: "t", en: "T" } as any, weight: 1, isActive: true, ...overrides } as any);

    it("throws when DISCOUNT rewardValue is 0", async () => {
      const service = new FortuneWheelService(buildPrisma() as any);
      await expect(service.create(baseCreate({ rewardType: FortuneWheelRewardType.DISCOUNT, rewardValue: 0 }))).rejects.toThrow(BadRequestException);
    });

    it("throws when DISCOUNT rewardValue > 100", async () => {
      const service = new FortuneWheelService(buildPrisma() as any);
      await expect(service.create(baseCreate({ rewardType: FortuneWheelRewardType.DISCOUNT, rewardValue: 101 }))).rejects.toThrow(BadRequestException);
    });

    it("throws when FIXED_AMOUNT rewardValue <= 0", async () => {
      const service = new FortuneWheelService(buildPrisma() as any);
      await expect(service.create(baseCreate({ rewardType: FortuneWheelRewardType.FIXED_AMOUNT, rewardValue: 0 }))).rejects.toThrow(BadRequestException);
    });

    it("throws when minOrderAmount > maxOrderAmount", async () => {
      const service = new FortuneWheelService(buildPrisma() as any);
      await expect(service.create(baseCreate({ rewardType: FortuneWheelRewardType.DISCOUNT, rewardValue: 20, minOrderAmount: 200, maxOrderAmount: 100 }))).rejects.toThrow(BadRequestException);
    });

    it("passes with valid DISCOUNT 1-100", async () => {
      const service = new FortuneWheelService(buildPrisma() as any);
      await expect(service.create(baseCreate({ rewardType: FortuneWheelRewardType.DISCOUNT, rewardValue: 50 }))).resolves.not.toThrow();
    });
  });

  describe("listMyRewards()", () => {
    it("passes storeId filter to Prisma when provided", async () => {
      const prisma = buildPrisma({
        fortuneWheelUserReward: {
          findMany: jest.fn().mockResolvedValue([{ id: 1, storeId: 3 }]),
          count: jest.fn().mockResolvedValue(1),
          create: jest.fn(),
        },
      });
      const service = new FortuneWheelService(prisma as any);
      await service.listMyRewards(7, { storeId: 3 } as any);
      expect(prisma.fortuneWheelUserReward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ storeId: 3 }) }),
      );
    });

    it("does NOT include storeId in where when undefined", async () => {
      const prisma = buildPrisma({
        fortuneWheelUserReward: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn(),
        },
      });
      const service = new FortuneWheelService(prisma as any);
      await service.listMyRewards(7, {} as any);
      const whereArg = (prisma.fortuneWheelUserReward.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty("storeId");
    });
  });

});
