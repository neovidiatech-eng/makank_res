import { BadRequestException } from '@nestjs/common';
import { FortuneWheelRewardStatus, FortuneWheelRewardType, OrderType } from '@prisma/client';
import { HelpersService } from '../services/helpers.service';

describe('Fortune Reward Store Scope Validation', () => {
  let helpersService: HelpersService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      fortuneWheelUserReward: {
        findUnique: jest.fn(),
      },
    };
    helpersService = new HelpersService(
      mockPrisma,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
    );
  });

  describe('Store-specific rewards (storeId !== null)', () => {
    const storeSpecificReward = {
      id: 1,
      userId: 100,
      storeId: 42,
      status: FortuneWheelRewardStatus.VALID,
      expiresAt: new Date(Date.now() + 86400000),
      rewardType: FortuneWheelRewardType.FREE_DELIVERY,
      rewardValue: 0,
      minOrderAmount: null,
      maxOrderAmount: null,
      maxDiscount: null,
      Store: { id: 42, name: 'بشاميلا' },
    };

    it('rejects store-specific reward for custom delivery (مندوب خاص)', async () => {
      mockPrisma.fortuneWheelUserReward.findUnique.mockResolvedValue(storeSpecificReward);

      await expect(
        helpersService.verifyCustomDeliveryReward(1, 100, 100, 30),
      ).rejects.toThrow(BadRequestException);

      await expect(
        helpersService.verifyCustomDeliveryReward(1, 100, 100, 30),
      ).rejects.toThrow('هذه الجائزة صالحة فقط للطلب من المطعم المحدد في عجلة الحظ');
    });

    it('rejects store-specific reward when orderStoreId does not match', async () => {
      mockPrisma.fortuneWheelUserReward.findUnique.mockResolvedValue(storeSpecificReward);

      await expect(
        helpersService.verifyFortuneReward(
          1,
          100,
          100,
          OrderType.DELIVERY,
          30,
          99, // Different store
        ),
      ).rejects.toThrow('هذه الجائزة صالحة فقط للطلب من المطعم المحدد في عجلة الحظ');
    });

    it('rejects store-specific reward when orderStoreId is undefined', async () => {
      mockPrisma.fortuneWheelUserReward.findUnique.mockResolvedValue(storeSpecificReward);

      await expect(
        helpersService.verifyFortuneReward(
          1,
          100,
          100,
          OrderType.CUSTOM_DELIVERY,
          30,
          undefined,
        ),
      ).rejects.toThrow('هذه الجائزة صالحة فقط للطلب من المطعم المحدد في عجلة الحظ');
    });

    it('accepts store-specific reward when orderStoreId matches', async () => {
      mockPrisma.fortuneWheelUserReward.findUnique.mockResolvedValue(storeSpecificReward);

      const result = await helpersService.verifyFortuneReward(
        1,
        100,
        100,
        OrderType.DELIVERY,
        30,
        42, // Matching store
      );

      expect(result).toEqual({
        rewardId: 1,
        rewardDiscount: 0,
        freeDelivery: true,
      });
    });
  });

  describe('Global rewards (storeId === null)', () => {
    const globalReward = {
      id: 2,
      userId: 100,
      storeId: null,
      status: FortuneWheelRewardStatus.VALID,
      expiresAt: new Date(Date.now() + 86400000),
      rewardType: FortuneWheelRewardType.FREE_DELIVERY,
      rewardValue: 0,
      minOrderAmount: null,
      maxOrderAmount: null,
      maxDiscount: null,
      Store: null,
    };

    it('allows global free-delivery reward for custom delivery', async () => {
      mockPrisma.fortuneWheelUserReward.findUnique.mockResolvedValue(globalReward);

      const result = await helpersService.verifyCustomDeliveryReward(2, 100, 100, 30);
      expect(result.rewardId).toBe(2);
    });

    it('allows global free-delivery reward for any store', async () => {
      mockPrisma.fortuneWheelUserReward.findUnique.mockResolvedValue(globalReward);

      const result = await helpersService.verifyFortuneReward(
        2,
        100,
        100,
        OrderType.DELIVERY,
        30,
        999,
      );
      expect(result.freeDelivery).toBe(true);
    });
  });
});
