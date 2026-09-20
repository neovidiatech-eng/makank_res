import { HelpersService } from '../services/helpers.service';
import { StoreService } from '../../store/services/store.service';
import { PromoDiscountType } from '@prisma/client';

const mockDeliveryPromotionService = {
  getActivePromotionForContext: jest.fn().mockResolvedValue(null),
  applyPromotion: jest.fn().mockImplementation((basePrice: number, promo: any) => ({
    finalShipping: basePrice,
    originalShipping: basePrice,
    discountAmount: 0,
    isPromotional: false,
    promotionId: null,
    promotionBadgeText: null,
  })),
};

describe('Global Zone Pricing Toggle (Unified 15 EGP Delivery Fee)', () => {
  describe('HelpersService.getDeliveryPrice', () => {
    let mockPrisma: any;
    let mockSettingsService: any;
    let mockZoneService: any;
    let mockMapService: any;
    let helpers: HelpersService;

    beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma = {
        address: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            lat: 30.0444,
            lng: 31.2357,
          }),
        },
        branch: {
          findUnique: jest.fn().mockResolvedValue({
            id: 10,
            storeId: 100,
            lat: 30.05,
            lng: 31.24,
          }),
        },
        settings: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      mockZoneService = {
        getStoreZoneDeliveryPrice: jest.fn().mockResolvedValue(40),
        getZoneDeliveryPrice: jest.fn().mockResolvedValue(25),
        resolveZoneId: jest.fn().mockResolvedValue(5),
      };

      mockMapService = {
        getBatchDetails: jest.fn().mockResolvedValue([{ distance: 4.5 }]),
      };

      // Reset applyPromotion to pass-through (no promotion)
      mockDeliveryPromotionService.applyPromotion.mockImplementation((basePrice: number) => ({
        finalShipping: basePrice,
        originalShipping: basePrice,
        discountAmount: 0,
        isPromotional: false,
        promotionId: null,
        promotionBadgeText: null,
      }));
      mockDeliveryPromotionService.getActivePromotionForContext.mockResolvedValue(null);
    });

    it('returns fixed 15 EGP delivery fee across all zones when globalZonePricingEnabled is false', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: false,
          shippingKMCharge: 0.0001,
          deliveryCommission: 15,
        }),
      };

      helpers = new HelpersService(
        mockPrisma,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        mockDeliveryPromotionService as any,
      );

      const result = await helpers.getDeliveryPrice(1, 10, 100, 99);
      expect(result.finalShipping).toBe(15);
      expect(mockZoneService.getStoreZoneDeliveryPrice).not.toHaveBeenCalled();
      expect(mockZoneService.getZoneDeliveryPrice).not.toHaveBeenCalled();
    });

    it('returns fixed 15 EGP when globalZonePricingEnabled is string "false"', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: 'false',
          shippingKMCharge: 0.0001,
          deliveryCommission: 15,
        }),
      };

      helpers = new HelpersService(
        mockPrisma,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        mockDeliveryPromotionService as any,
      );

      const result = await helpers.getDeliveryPrice(1, 10, 100, 99);
      expect(result.finalShipping).toBe(15);
    });

    it('returns fixed 15 EGP when shippingKMCharge is 0', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: false,
          shippingKMCharge: 0,
          deliveryCommission: 15,
        }),
      };

      helpers = new HelpersService(
        mockPrisma,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        mockDeliveryPromotionService as any,
      );

      const result = await helpers.getDeliveryPrice(1, 10, 100, 99);
      expect(result.finalShipping).toBe(15);
    });

    it('applies zone price when globalZonePricingEnabled is true', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: true,
          shippingKMCharge: 0.0001,
          deliveryCommission: 15,
        }),
      };

      helpers = new HelpersService(
        mockPrisma,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        mockDeliveryPromotionService as any,
      );

      const result = await helpers.getDeliveryPrice(1, 10, 100, 99);
      expect(result.finalShipping).toBe(40);
    });

    // ─── Promo overlay integration ─────────────────────────────────────────
    it('applies promo discount on top of zone price', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: true,
          shippingKMCharge: 0.0001,
          deliveryCommission: 15,
        }),
      };

      // Zone price = 40; promo reduces to 20
      mockDeliveryPromotionService.getActivePromotionForContext.mockResolvedValue({
        id: 7,
        discountType: PromoDiscountType.FIXED_PRICE,
        promoValue: 20,
        badgeText: null,
      });
      mockDeliveryPromotionService.applyPromotion.mockReturnValue({
        finalShipping: 20,
        originalShipping: 40,
        discountAmount: 20,
        isPromotional: true,
        promotionId: 7,
        promotionBadgeText: 'توصيل مخفض لفترة محدودة',
      });

      helpers = new HelpersService(
        mockPrisma,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        mockDeliveryPromotionService as any,
      );

      const result = await helpers.getDeliveryPrice(1, 10, 100, 99);
      expect(result.finalShipping).toBe(20);
      expect(result.originalShipping).toBe(40);
      expect(result.discountAmount).toBe(20);
      expect(result.isPromotional).toBe(true);
      expect(result.promotionId).toBe(7);
      expect(result.promotionBadgeText).toBe('توصيل مخفض لفترة محدودة');
    });

    it('returns promo zone price when priceAfterDiscount is set lower than price', async () => {
      mockZoneService.getStoreZonePriceEntry = jest.fn().mockResolvedValue({
        price: 35,
        priceAfterDiscount: 20,
      });

      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: true,
          shippingKMCharge: 10,
          deliveryCommission: 5,
        }),
      };

      helpers = new HelpersService(
        mockPrisma,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        mockDeliveryPromotionService as any,
      );

      const result = await helpers.getDeliveryPrice(1, 10, 100, 99);
      expect(result.finalShipping).toBe(20);
      expect(result.originalShipping).toBe(35);
      expect(result.discountAmount).toBe(15);
      expect(result.isPromotional).toBe(true);
    });

    it('returns regular price when priceAfterDiscount is null', async () => {
      mockZoneService.getStoreZonePriceEntry = jest.fn().mockResolvedValue({
        price: 35,
        priceAfterDiscount: null,
      });

      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: true,
          shippingKMCharge: 10,
          deliveryCommission: 5,
        }),
      };

      helpers = new HelpersService(
        mockPrisma,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        mockDeliveryPromotionService as any,
      );

      const result = await helpers.getDeliveryPrice(1, 10, 100, 99);
      expect(result.finalShipping).toBe(35);
      expect(result.originalShipping).toBe(35);
      expect(result.discountAmount).toBe(0);
      expect(result.isPromotional).toBe(false);
    });

    it('returns noDelivery object when no address and no selected zone', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: true,
          shippingKMCharge: 10,
          deliveryCommission: 5,
        }),
      };

      helpers = new HelpersService(
        mockPrisma,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        mockDeliveryPromotionService as any,
      );

      const result = await helpers.getDeliveryPrice(null as any, 10, 100, null);
      expect(result.finalShipping).toBe(0);
      expect(result.isPromotional).toBe(false);
    });
  });

  describe('StoreService.getEffectiveZonePrices', () => {
    let mockPrisma: any;
    let mockSettingsService: any;
    let mockZoneService: any;
    let storeService: StoreService;

    beforeEach(() => {
      mockPrisma = {
        zone: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, name: 'Zone 1', cityId: 1 },
            { id: 2, name: 'Zone 2', cityId: 1 },
            { id: 3, name: 'Zone 3', cityId: 1 },
          ]),
        },
        store: {
          findUnique: jest.fn().mockResolvedValue({
            id: 10,
            zonePricingEnabled: true,
          }),
        },
      };

      mockZoneService = {
        getStoreZoneDeliveryPrice: jest.fn().mockImplementation((storeId, zoneId) => {
          const map: Record<number, number> = { 1: 20, 2: 25, 3: 30 };
          return Promise.resolve(map[zoneId] ?? null);
        }),
        getZoneDeliveryPrice: jest.fn().mockResolvedValue(15),
      };
    });

    it('returns unified 15 EGP for ALL zones when globalZonePricingEnabled is false', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: false,
          deliveryCommission: 15,
        }),
      };

      storeService = new StoreService(
        mockPrisma,
        null as any,
        null as any,
        mockSettingsService,
        null as any,
        null as any,
        mockZoneService,
        null as any,
        null as any,
        null as any,
      );
      (storeService as any).resolveStoreId = jest.fn().mockResolvedValue(10);

      const result = await storeService.getEffectiveZonePrices('10');
      expect(result).toEqual([
        { zoneId: 1, name: 'Zone 1', cityId: 1, price: 15, priceAfterDiscount: null },
        { zoneId: 2, name: 'Zone 2', cityId: 1, price: 15, priceAfterDiscount: null },
        { zoneId: 3, name: 'Zone 3', cityId: 1, price: 15, priceAfterDiscount: null },
      ]);
      expect(mockZoneService.getStoreZoneDeliveryPrice).not.toHaveBeenCalled();
    });

    it('returns individual zone prices when globalZonePricingEnabled is true', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: true,
          deliveryCommission: 15,
        }),
      };

      storeService = new StoreService(
        mockPrisma,
        null as any,
        null as any,
        mockSettingsService,
        null as any,
        null as any,
        mockZoneService,
        null as any,
        null as any,
        null as any,
      );
      (storeService as any).resolveStoreId = jest.fn().mockResolvedValue(10);

      const result = await storeService.getEffectiveZonePrices('10');
      expect(result).toEqual([
        { zoneId: 1, name: 'Zone 1', cityId: 1, price: 20, priceAfterDiscount: null },
        { zoneId: 2, name: 'Zone 2', cityId: 1, price: 25, priceAfterDiscount: null },
        { zoneId: 3, name: 'Zone 3', cityId: 1, price: 30, priceAfterDiscount: null },
      ]);
    });
  });

  describe('HelpersService.getCustomDeliveryPrice', () => {
    let mockZoneService: any;
    let mockSettingsService: any;
    let mockMapService: any;
    let helpers: HelpersService;

    beforeEach(() => {
      mockZoneService = {
        getZoneDeliveryPrice: jest.fn().mockResolvedValue(40),
        getZoneDeliveryPriceEntry: jest.fn().mockResolvedValue({
          price: 40,
          priceAfterDiscount: 25,
        }),
        resolveZoneId: jest.fn().mockResolvedValue(1),
      };

      mockMapService = {
        getBatchDetails: jest.fn().mockResolvedValue([{ distance: 5 }]),
      };
    });

    it('bypasses zone pricing when globalZonePricingEnabled is false and returns fixed baseFee when kmCharge is 0', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: false,
          customDeliveryKMCharge: '0',
          customDeliveryBaseFee: '15',
          deliveryCommission: '15',
        }),
      };

      helpers = new HelpersService(
        null as any,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        null as any,
      );

      const stops = [
        { lat: 30.0, lng: 31.0 },
        { lat: 30.1, lng: 31.1, zoneId: 1 },
      ];

      const price = await helpers.getCustomDeliveryPrice(stops);
      expect(price).toBe(15);
      expect(mockZoneService.getZoneDeliveryPrice).not.toHaveBeenCalled();
      expect(mockZoneService.getZoneDeliveryPriceEntry).not.toHaveBeenCalled();
      expect(mockMapService.getBatchDetails).not.toHaveBeenCalled();
    });

    it('calculates km distance formula when globalZonePricingEnabled is false and kmCharge > 0', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: false,
          customDeliveryKMCharge: '2',
          customDeliveryBaseFee: '10',
        }),
      };

      helpers = new HelpersService(
        null as any,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        null as any,
      );

      const stops = [
        { lat: 30.0, lng: 31.0 },
        { lat: 30.1, lng: 31.1, zoneId: 1 },
      ];

      const price = await helpers.getCustomDeliveryPrice(stops);
      // distance: 5 km * 2 + 10 = 20
      expect(price).toBe(20);
      expect(mockZoneService.getZoneDeliveryPrice).not.toHaveBeenCalled();
    });

    it('applies zone priceAfterDiscount when globalZonePricingEnabled is true and discount exists', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: true,
          customDeliveryKMCharge: '2',
          customDeliveryBaseFee: '10',
        }),
      };

      helpers = new HelpersService(
        null as any,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        null as any,
      );

      const stops = [
        { lat: 30.0, lng: 31.0 },
        { lat: 30.1, lng: 31.1, zoneId: 1 },
      ];

      const price = await helpers.getCustomDeliveryPrice(stops);
      expect(price).toBe(25); // priceAfterDiscount from zoneEntry
    });
  });

  describe('HelpersService.getDeliveryPrice — Global Zone Discount Fallback', () => {
    it('falls back to global zone discount when store override has null discount', async () => {
      const mockPrisma = {
        address: { findUnique: jest.fn().mockResolvedValue({ id: 1, lat: 30.0444, lng: 31.2357 }) },
        branch: { findUnique: jest.fn().mockResolvedValue({ id: 10, storeId: 100, lat: 30.05, lng: 31.24 }) },
        settings: { findUnique: jest.fn().mockResolvedValue(null) },
      };

      const mockZoneService = {
        getStoreZonePriceEntry: jest.fn().mockResolvedValue({
          price: 40,
          priceAfterDiscount: null, // Store has no explicit discount
        }),
        getZoneDeliveryPriceEntry: jest.fn().mockResolvedValue({
          price: 40,
          priceAfterDiscount: 20, // Global zone has 20 EGP discount
        }),
        resolveZoneId: jest.fn().mockResolvedValue(5),
      };

      const mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          globalZonePricingEnabled: true,
          shippingKMCharge: 10,
          deliveryCommission: 5,
        }),
      };

      const helpers = new HelpersService(
        mockPrisma as any,
        null as any,
        null as any,
        mockSettingsService as any,
        null as any,
        mockZoneService as any,
        mockDeliveryPromotionService as any,
      );

      const result = await helpers.getDeliveryPrice(1, 10, 100, 5);
      expect(result.finalShipping).toBe(20);
      expect(result.originalShipping).toBe(40);
      expect(result.discountAmount).toBe(20);
      expect(result.isPromotional).toBe(true);
    });
  });
});
