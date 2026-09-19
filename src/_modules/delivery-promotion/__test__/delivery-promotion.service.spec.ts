import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryPromoScope, PromoDiscountType } from '@prisma/client';
import { PrismaService } from 'src/globals/services/prisma.service';
import { DeliveryPromotionService } from '../delivery-promotion.service';

const mockPromoBase = {
  id: 1,
  name: 'Test Promo',
  badgeText: null,
  scope: DeliveryPromoScope.GLOBAL,
  discountType: PromoDiscountType.FIXED_PRICE,
  promoValue: 10,
  storeId: null,
  zoneId: null,
  startDate: null,
  endDate: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  deliveryPromotion: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('DeliveryPromotionService', () => {
  let service: DeliveryPromotionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryPromotionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DeliveryPromotionService>(DeliveryPromotionService);
    jest.clearAllMocks();
  });

  // --- Priority Cascade ---
  describe('getActivePromotionForContext — priority cascade', () => {
    it('STORE_ZONE wins over STORE, ZONE, GLOBAL', async () => {
      const storeZonePromo = { ...mockPromoBase, id: 10, scope: DeliveryPromoScope.STORE_ZONE };
      mockPrisma.deliveryPromotion.findFirst
        .mockResolvedValueOnce(storeZonePromo) // STORE_ZONE hit
        .mockResolvedValue(null);
      const result = await service.getActivePromotionForContext(1, 2);
      expect(result).toEqual(storeZonePromo);
      // Should stop after first findFirst call
      expect(mockPrisma.deliveryPromotion.findFirst).toHaveBeenCalledTimes(1);
    });

    it('falls through to STORE when no STORE_ZONE match', async () => {
      const storePromo = { ...mockPromoBase, id: 11, scope: DeliveryPromoScope.STORE };
      mockPrisma.deliveryPromotion.findFirst
        .mockResolvedValueOnce(null)        // STORE_ZONE miss
        .mockResolvedValueOnce(storePromo); // STORE hit
      const result = await service.getActivePromotionForContext(1, 2);
      expect(result).toEqual(storePromo);
      expect(mockPrisma.deliveryPromotion.findFirst).toHaveBeenCalledTimes(2);
    });

    it('falls through to ZONE when no STORE_ZONE/STORE match', async () => {
      const zonePromo = { ...mockPromoBase, id: 12, scope: DeliveryPromoScope.ZONE };
      mockPrisma.deliveryPromotion.findFirst
        .mockResolvedValueOnce(null)       // STORE_ZONE miss
        .mockResolvedValueOnce(null)       // STORE miss
        .mockResolvedValueOnce(zonePromo); // ZONE hit
      const result = await service.getActivePromotionForContext(1, 2);
      expect(result).toEqual(zonePromo);
    });

    it('falls through to GLOBAL as last resort', async () => {
      const globalPromo = { ...mockPromoBase, id: 13, scope: DeliveryPromoScope.GLOBAL };
      mockPrisma.deliveryPromotion.findFirst
        .mockResolvedValueOnce(null)         // STORE_ZONE miss
        .mockResolvedValueOnce(null)         // STORE miss
        .mockResolvedValueOnce(null)         // ZONE miss
        .mockResolvedValueOnce(globalPromo); // GLOBAL hit
      const result = await service.getActivePromotionForContext(1, 2);
      expect(result).toEqual(globalPromo);
    });

    it('returns null when no active promos exist', async () => {
      mockPrisma.deliveryPromotion.findFirst.mockResolvedValue(null);
      const result = await service.getActivePromotionForContext(1, 2);
      expect(result).toBeNull();
    });

    it('skips STORE_ZONE check when storeId is null', async () => {
      mockPrisma.deliveryPromotion.findFirst.mockResolvedValue(null);
      await service.getActivePromotionForContext(null, 2);
      // Only ZONE + GLOBAL are checked (no STORE_ZONE, no STORE when storeId=null)
      const calls = mockPrisma.deliveryPromotion.findFirst.mock.calls;
      const scopes = calls.map((c: any) => c[0].where.scope);
      expect(scopes).not.toContain(DeliveryPromoScope.STORE_ZONE);
      expect(scopes).not.toContain(DeliveryPromoScope.STORE);
    });

    it('skips ZONE check when zoneId is null', async () => {
      mockPrisma.deliveryPromotion.findFirst.mockResolvedValue(null);
      await service.getActivePromotionForContext(1, null);
      const calls = mockPrisma.deliveryPromotion.findFirst.mock.calls;
      const scopes = calls.map((c: any) => c[0].where.scope);
      expect(scopes).not.toContain(DeliveryPromoScope.ZONE);
    });
  });

  // --- applyPromotion ---
  describe('applyPromotion', () => {
    it('returns basePrice unchanged when no promo', () => {
      const result = service.applyPromotion(35, null);
      expect(result.finalShipping).toBe(35);
      expect(result.originalShipping).toBe(35);
      expect(result.discountAmount).toBe(0);
      expect(result.isPromotional).toBe(false);
      expect(result.promotionId).toBeNull();
      expect(result.promotionBadgeText).toBeNull();
    });

    it('FIXED_PRICE: sets finalShipping to promoValue', () => {
      const promo = { id: 1, discountType: PromoDiscountType.FIXED_PRICE, promoValue: 20, badgeText: null };
      const result = service.applyPromotion(35, promo);
      expect(result.finalShipping).toBe(20);
      expect(result.originalShipping).toBe(35);
      expect(result.discountAmount).toBe(15);
      expect(result.isPromotional).toBe(true);
      expect(result.promotionId).toBe(1);
      expect(result.promotionBadgeText).toBe('توصيل مخفض لفترة محدودة');
    });

    it('DISCOUNT_AMOUNT: subtracts promoValue from base price', () => {
      const promo = { id: 2, discountType: PromoDiscountType.DISCOUNT_AMOUNT, promoValue: 10, badgeText: 'خصم خاص' };
      const result = service.applyPromotion(35, promo);
      expect(result.finalShipping).toBe(25);
      expect(result.originalShipping).toBe(35);
      expect(result.discountAmount).toBe(10);
      expect(result.promotionBadgeText).toBe('خصم خاص');
    });

    it('DISCOUNT_AMOUNT: finalShipping is never negative', () => {
      const promo = { id: 3, discountType: PromoDiscountType.DISCOUNT_AMOUNT, promoValue: 999, badgeText: null };
      const result = service.applyPromotion(35, promo);
      expect(result.finalShipping).toBe(0);
      expect(result.discountAmount).toBe(35);
    });

    it('FIXED_PRICE: promoValue of 0 means free delivery', () => {
      const promo = { id: 4, discountType: PromoDiscountType.FIXED_PRICE, promoValue: 0, badgeText: null };
      const result = service.applyPromotion(35, promo);
      expect(result.finalShipping).toBe(0);
      expect(result.discountAmount).toBe(35);
      expect(result.isPromotional).toBe(true);
    });

    it('uses custom badgeText when provided', () => {
      const promo = { id: 5, discountType: PromoDiscountType.FIXED_PRICE, promoValue: 5, badgeText: 'عرض خاص' };
      const result = service.applyPromotion(35, promo);
      expect(result.promotionBadgeText).toBe('عرض خاص');
    });

    it('rounds to 2 decimal places', () => {
      const promo = { id: 6, discountType: PromoDiscountType.DISCOUNT_AMOUNT, promoValue: 1.005, badgeText: null };
      const result = service.applyPromotion(35.005, promo);
      expect(Number.isInteger(result.finalShipping * 100)).toBe(true);
      expect(Number.isInteger(result.discountAmount * 100)).toBe(true);
    });
  });
});
