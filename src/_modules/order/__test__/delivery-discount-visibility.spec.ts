import { CommissionType, OrderType } from '@prisma/client';
import { OrderService } from '../order.service';
import { HelpersService } from '../services/helpers.service';

describe('Delivery Discount Visibility & Custom Delivery Decoupling', () => {
  describe('OrderService.calculateOrder — Delivery Discount Breakdown', () => {
    const buildStore = () => ({
      tax: 0,
      commission: 0,
      commissionType: CommissionType.FIXED,
      minOrderAmount: null,
    });

    const buildHelpers = (deliveryCalc: any, fortuneResult?: any) => ({
      validateServiceAvailability: jest.fn().mockResolvedValue({
        id: 1,
        storeId: 1,
        Store: buildStore(),
      }),
      validateSizeAndAddons: jest.fn().mockResolvedValue({
        basePrice: 50,
        addonsPrice: 0,
      }),
      validateAndPriceBundles: jest.fn().mockResolvedValue([]),
      getTax: jest.fn().mockImplementation((price: number) =>
        Promise.resolve({ tax: 0, priceAfterTax: price }),
      ),
      getDeliveryPrice: jest.fn().mockResolvedValue(deliveryCalc),
      verifyCoupon: jest.fn().mockImplementation((code, userId, storeId, subtotal) =>
        Promise.resolve({
          totalAfterDiscount: subtotal,
          discountValue: 0,
          couponId: null,
        }),
      ),
      verifyFortuneReward: jest.fn().mockResolvedValue(
        fortuneResult ?? {
          freeDelivery: false,
          rewardDiscount: 0,
          rewardId: null,
        },
      ),
    });

    const buildService = (helpers: any) =>
      new OrderService(
        {
          branch: { findUnique: jest.fn().mockResolvedValue({ maxActiveOrders: null }) },
          order: { count: jest.fn().mockResolvedValue(0) },
          address: {
            findUnique: jest.fn().mockResolvedValue({ lat: 30.0, lng: 31.0 }),
          },
        } as any,
        undefined as any,
        helpers as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        { getSettings: jest.fn().mockResolvedValue({ pickupEnabled: true }) } as any,
        undefined as any,
        {
          applyStoreCommission: jest.fn().mockReturnValue({
            clientFacingPrice: 50,
            storeCommissionPerUnit: 0,
          }),
          getGlobalCommissionSettings: jest.fn().mockResolvedValue({}),
          calculateGlobalCommission: jest.fn().mockReturnValue(0),
        } as any,
        undefined as any,
        { resolveZoneId: jest.fn().mockResolvedValue(1) } as any,
        undefined as any,
        undefined as any,
        undefined as any,
      );

    const baseData = {
      items: [{ serviceId: 1, quantity: 1 }],
      branchId: 9,
      addressId: 1,
      type: OrderType.DELIVERY,
    } as any;

    it('returns delivery discount breakdown with true pre-discount originalShippingFee and hasDeliveryDiscount: true when promo is applied', async () => {
      const helpers = buildHelpers({
        finalShipping: 15,
        originalShipping: 35,
        discountAmount: 20,
        isPromotional: true,
        promotionId: 5,
        promotionBadgeText: 'خصم خاص',
      });
      const service = buildService(helpers);

      const result = await service.calculateOrder(baseData);

      expect(result.shipping).toBe(15);
      expect(result.originalShippingFee).toBe(35);
      expect(result.deliveryOriginalShipping).toBe(35);
      expect(result.hasDeliveryDiscount).toBe(true);
      expect(result.deliveryDiscount).toBe(20);
      expect(result.deliveryDiscountAmount).toBe(20);
      expect(result.deliveryIsPromotional).toBe(true);
      expect(result.deliveryPromotionBadge).toBe('خصم خاص');
      expect(result.deliveryPromotionId).toBe(5);
    });

    it('returns hasDeliveryDiscount: false and originalShippingFee == shipping when no delivery discount exists', async () => {
      const helpers = buildHelpers({
        finalShipping: 25,
        originalShipping: 25,
        discountAmount: 0,
        isPromotional: false,
        promotionId: null,
        promotionBadgeText: null,
      });
      const service = buildService(helpers);

      const result = await service.calculateOrder(baseData);

      expect(result.shipping).toBe(25);
      expect(result.originalShippingFee).toBe(25);
      expect(result.deliveryOriginalShipping).toBe(25);
      expect(result.hasDeliveryDiscount).toBe(false);
      expect(result.deliveryDiscount).toBe(0);
      expect(result.deliveryDiscountAmount).toBe(0);
      expect(result.deliveryIsPromotional).toBe(false);
      expect(result.deliveryPromotionBadge).toBeNull();
    });

    it('correctly populates delivery discount fields when customer uses Free Delivery fortune reward', async () => {
      const helpers = buildHelpers(
        {
          finalShipping: 25,
          originalShipping: 25,
          discountAmount: 0,
          isPromotional: false,
          promotionId: null,
          promotionBadgeText: null,
        },
        {
          freeDelivery: true,
          rewardDiscount: 25,
          rewardId: 99,
        },
      );
      const service = buildService(helpers);

      const result = await service.calculateOrder({ ...baseData, fortuneRewardId: 99 });

      expect(result.shipping).toBe(0);
      expect(result.originalShippingFee).toBe(25);
      expect(result.hasDeliveryDiscount).toBe(true);
      expect(result.deliveryDiscountAmount).toBe(25);
      expect(result.deliveryIsPromotional).toBe(true);
      expect(result.deliveryPromotionBadge).toBe('توصيل مجاني');
      expect(result.isFreeDeliveryFortune).toBe(true);
      expect(result.rewardId).toBe(99);
    });
  });

  describe('HelpersService.getCustomDeliveryPrice — Decoupled from Store Zone Pricing', () => {
    let mockPrisma: any;
    let mockMapService: any;
    let mockSettingsService: any;
    let mockZoneService: any;
    let mockDeliveryPromotionService: any;
    let helpers: HelpersService;

    beforeEach(() => {
      mockPrisma = {
        zone: { findUnique: jest.fn() },
      };

      mockMapService = {
        getDistance: jest.fn().mockResolvedValue(5),
        getBatchDetails: jest.fn().mockResolvedValue([{ distance: 5 }]),
      };

      mockZoneService = {
        getZoneDeliveryPriceEntry: jest.fn(),
        getZoneDeliveryPrice: jest.fn(),
        resolveZoneId: jest.fn(),
      };

      mockDeliveryPromotionService = {
        getActivePromotionForContext: jest.fn().mockResolvedValue(null),
        applyPromotion: jest.fn(),
      };
    });

    it('calculates custom delivery solely based on customDeliveryBaseFee + customDeliveryKMCharge, ignoring Zone.deliveryPrice', async () => {
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          customDeliveryBaseFee: 12,
          customDeliveryKMCharge: 3,
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
        mockDeliveryPromotionService,
      );

      const stops = [
        { lat: 30.0, lng: 31.0, zoneId: 10 },
        { lat: 30.1, lng: 31.1, zoneId: 20 },
      ];

      const price = await helpers.getCustomDeliveryPrice(stops);

      // 5 km * 3 + 12 base = 27 EGP
      expect(price).toBe(27);

      // Verify that Zone.deliveryPrice / store zone pricing functions were never called
      expect(mockZoneService.getZoneDeliveryPriceEntry).not.toHaveBeenCalled();
      expect(mockZoneService.getZoneDeliveryPrice).not.toHaveBeenCalled();
      expect(mockZoneService.resolveZoneId).not.toHaveBeenCalled();
    });

    it('returns customDeliveryBaseFee when distance is 0 or calculation yields less than base fee', async () => {
      mockMapService.getDistance.mockResolvedValue(0);
      mockMapService.getBatchDetails.mockResolvedValue([{ distance: 0 }]);
      mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue({
          customDeliveryBaseFee: 15,
          customDeliveryKMCharge: 2,
        }),
      };

      helpers = new HelpersService(
        mockPrisma,
        null as any,
        mockMapService,
        mockSettingsService,
        null as any,
        mockZoneService,
        mockDeliveryPromotionService,
      );

      const stops = [
        { lat: 30.0, lng: 31.0 },
        { lat: 30.0, lng: 31.0 },
      ];

      const price = await helpers.getCustomDeliveryPrice(stops);
      expect(price).toBe(15);
    });
  });
});
