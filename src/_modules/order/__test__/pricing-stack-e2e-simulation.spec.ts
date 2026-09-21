import { CommissionType, OrderType, PromoDiscountType } from '@prisma/client';
import { ServiceModuleHelper } from '../../serviceModule/services/serviceModule.helper.service';
import { OrderService } from '../order.service';
import { HelpersService } from '../services/helpers.service';

/**
 * End-to-End Cross-Stack Simulation: Dashboard -> Backend -> Mobile
 * Topic: Store Zone Pricing, Delivery Discounts & Decoupled Custom Delivery (مندوب خاص)
 *
 * Simulates:
 * 1. Dashboard setting configurations and zone discount inputs.
 * 2. Backend pricing calculation engine (HelpersService + OrderService).
 * 3. Mobile API contract validation (OrderPricingSettings, ZoneModel, OrderCalculationResponse).
 */
describe('E2E Stack Simulation: Dashboard -> Backend -> Mobile Delivery Pricing & Decoupling', () => {
  // Shared mock store
  const mockStore = {
    tax: 0,
    commission: 0,
    commissionType: CommissionType.FIXED,
    minOrderAmount: null,
  };

  describe('Scenario 1: Store Order with Delivery Discount configured via Dashboard', () => {
    it('Flow: Dashboard saves discounted zone (40 -> 20 EGP) -> Backend calculateOrder returns discount breakdown -> Mobile contract passes', async () => {
      // 1. Dashboard payload simulation (what Admin enters in Zones page)
      const dashboardZoneInput = {
        nameAr: 'منطقة الجمهورية',
        nameEn: 'El Gomhouria Zone',
        cityId: 1,
        deliveryPrice: 40,
        priceAfterDiscount: 20,
      };

      // 2. Backend Settings & Zone service resolution
      const mockSettings = {
        globalZonePricingEnabled: true,
        shippingKMCharge: 0.0001,
        deliveryCommission: 15,
      };

      const mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue(mockSettings),
      };

      const mockZoneService = {
        getZoneDeliveryPriceEntry: jest.fn().mockResolvedValue({
          price: dashboardZoneInput.deliveryPrice,
          priceAfterDiscount: dashboardZoneInput.priceAfterDiscount,
        }),
        getZoneDeliveryPrice: jest.fn().mockResolvedValue(dashboardZoneInput.deliveryPrice),
        getStoreZoneDeliveryPrice: jest.fn().mockResolvedValue(null),
        getStoreZoneDeliveryPriceEntry: jest.fn().mockResolvedValue(null),
        resolveZoneId: jest.fn().mockResolvedValue(10),
      };

      const mockDeliveryPromotionService = {
        getActivePromotionForContext: jest.fn().mockResolvedValue(null),
        applyPromotion: jest.fn().mockImplementation((basePrice: number, promo: any) => ({
          finalShipping: promo ? promo.promoValue : basePrice,
          originalShipping: basePrice,
          discountAmount: promo ? basePrice - promo.promoValue : 0,
          isPromotional: !!promo,
          promotionId: promo?.id ?? null,
          promotionBadgeText: promo?.badgeText ?? null,
        })),
      };

      const mockPrisma = {
        address: { findUnique: jest.fn().mockResolvedValue({ lat: 30.97, lng: 31.16 }) },
        branch: { findUnique: jest.fn().mockResolvedValue({ lat: 30.95, lng: 31.15 }) },
        zone: { findUnique: jest.fn() },
        settings: { findUnique: jest.fn().mockResolvedValue(null) },
      };

      const helpersService = new HelpersService(
        mockPrisma as any,
        null as any,
        { getDistance: jest.fn().mockResolvedValue(3), getBatchDetails: jest.fn().mockResolvedValue([{ distance: 3 }]) } as any,
        mockSettingsService as any,
        null as any,
        mockZoneService as any,
        mockDeliveryPromotionService as any,
      );

      // Verify getDeliveryPrice in Helpers
      const deliveryCalc = await helpersService.getDeliveryPrice(1, 9, 100, 10);
      expect(deliveryCalc.finalShipping).toBe(20);
      expect(deliveryCalc.originalShipping).toBe(40);
      expect(deliveryCalc.discountAmount).toBe(20);
      expect(deliveryCalc.isPromotional).toBe(true);

      // Now verify full OrderService.calculateOrder
      const orderService = new OrderService(
        {
          branch: { findUnique: jest.fn().mockResolvedValue({ maxActiveOrders: null }) },
          order: { count: jest.fn().mockResolvedValue(0) },
          address: { findUnique: jest.fn().mockResolvedValue({ lat: 30.97, lng: 31.16 }) },
        } as any,
        undefined as any,
        {
          validateServiceAvailability: jest.fn().mockResolvedValue({ id: 1, storeId: 5, Store: mockStore }),
          validateSizeAndAddons: jest.fn().mockResolvedValue({ basePrice: 60, addonsPrice: 0 }),
          validateAndPriceBundles: jest.fn().mockResolvedValue([]),
          getTax: jest.fn().mockResolvedValue({ tax: 0, priceAfterTax: 60 }),
          getDeliveryPrice: jest.fn().mockResolvedValue(deliveryCalc),
          verifyCoupon: jest.fn().mockResolvedValue({ totalAfterDiscount: 60, discountValue: 0, couponId: null }),
          verifyFortuneReward: jest.fn().mockResolvedValue({ freeDelivery: false, rewardDiscount: 0, rewardId: null }),
        } as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        { getSettings: jest.fn().mockResolvedValue({ pickupEnabled: true }) } as any,
        undefined as any,
        {
          applyStoreCommission: jest.fn().mockReturnValue({ clientFacingPrice: 60, storeCommissionPerUnit: 0 }),
          getGlobalCommissionSettings: jest.fn().mockResolvedValue({}),
          calculateGlobalCommission: jest.fn().mockReturnValue(0),
        } as any,
        undefined as any,
        { resolveZoneId: jest.fn().mockResolvedValue(10) } as any,
        undefined as any,
        undefined as any,
        undefined as any,
      );

      const orderCalculation = await orderService.calculateOrder({
        items: [{ serviceId: 1, quantity: 1 }],
        branchId: 9,
        addressId: 1,
        type: OrderType.DELIVERY,
        zoneId: 10,
      } as any);

      // Assert complete Backend calculation response matches Mobile expectation
      expect(orderCalculation.subtotal).toBe(60);
      expect(orderCalculation.shipping).toBe(20);
      expect(orderCalculation.originalShippingFee).toBe(40);
      expect(orderCalculation.deliveryOriginalShipping).toBe(40);
      expect(orderCalculation.deliveryDiscountAmount).toBe(20);
      expect(orderCalculation.hasDeliveryDiscount).toBe(true);
      expect(orderCalculation.deliveryIsPromotional).toBe(true);
      expect(orderCalculation.deliveryPromotionBadge).toBe('توصيل مخفض');
      expect(orderCalculation.totalPrice).toBe(80); // 60 items + 20 shipping

      // 3. Mobile Contract verification: simulate serialization as mobile receives it
      const mobileJsonPayload = {
        data: {
          price: orderCalculation.subtotal,
          shipping: orderCalculation.shipping,
          originalShippingFee: orderCalculation.originalShippingFee,
          deliveryDiscountAmount: orderCalculation.deliveryDiscountAmount,
          hasDeliveryDiscount: orderCalculation.hasDeliveryDiscount,
          deliveryIsPromotional: orderCalculation.deliveryIsPromotional,
          deliveryPromotionBadge: orderCalculation.deliveryPromotionBadge,
          totalPrice: orderCalculation.totalPrice,
        },
      };

      expect(mobileJsonPayload.data.hasDeliveryDiscount).toBe(true);
      expect(mobileJsonPayload.data.originalShippingFee).toBeGreaterThan(mobileJsonPayload.data.shipping);
      expect(mobileJsonPayload.data.deliveryPromotionBadge).toBe('توصيل مخفض');
    });
  });

  describe('Scenario 2: Custom Delivery (مندوب خاص) is Decoupled from Store Zones', () => {
    it('Flow: Dashboard configures Custom Delivery (15 base + 3/km) -> Errand to Zone 10 does NOT use store zone price of 40/20 EGP', async () => {
      // 1. Dashboard settings for custom delivery
      const dashboardCustomDeliverySettings = {
        customDeliveryEnabled: true,
        customDeliveryBaseFee: 15,
        customDeliveryKMCharge: 3,
        customDeliveryExtraStopPrice: 7,
        globalZonePricingEnabled: true, // Enabled for stores
        deliveryCommission: 15,
      };

      const mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue(dashboardCustomDeliverySettings),
      };

      // Zone 10 has a restaurant delivery price of 40 (or 20 discounted)
      const mockZoneService = {
        getZoneDeliveryPriceEntry: jest.fn().mockResolvedValue({ price: 40, priceAfterDiscount: 20 }),
        getZoneDeliveryPrice: jest.fn().mockResolvedValue(40),
        resolveZoneId: jest.fn().mockResolvedValue(10),
      };

      // Trip distance: 4 km from pickup to dropoff
      const mockMapService = {
        getDistance: jest.fn().mockResolvedValue(4),
        getBatchDetails: jest.fn().mockResolvedValue([{ distance: 4 }]),
      };

      const helpersService = new HelpersService(
        { zone: { findUnique: jest.fn() } } as any,
        null as any,
        mockMapService as any,
        mockSettingsService as any,
        null as any,
        mockZoneService as any,
        { getActivePromotionForContext: jest.fn().mockResolvedValue(null) } as any,
      );

      const errandStops = [
        { lat: 30.96, lng: 31.15, zoneId: 1 },
        { lat: 30.98, lng: 31.17, zoneId: 10 }, // Destination is Zone 10!
      ];

      const customDeliveryPrice = await helpersService.getCustomDeliveryPrice(errandStops);

      // Calculated: 15 base + 4 km * 3 = 27 EGP
      expect(customDeliveryPrice).toBe(27);

      // Decoupling Assertion: Must NOT equal restaurant zone price of 40 or 20
      expect(customDeliveryPrice).not.toBe(40);
      expect(customDeliveryPrice).not.toBe(20);
      expect(mockZoneService.getZoneDeliveryPriceEntry).not.toHaveBeenCalled();
      expect(mockZoneService.getZoneDeliveryPrice).not.toHaveBeenCalled();

      // Verify custom delivery calculation with extra stops
      const orderService = new OrderService(
        {
          branch: { findUnique: jest.fn() },
          order: { count: jest.fn() },
        } as any,
        undefined as any,
        {
          getCustomDeliveryPrice: jest.fn().mockResolvedValue(customDeliveryPrice),
          getCustomDeliveryCommission: jest.fn().mockResolvedValue(0),
          verifyCustomDeliveryReward: jest.fn(),
        } as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        mockSettingsService as any,
        undefined as any,
        {
          getGlobalCommissionSettings: jest.fn().mockResolvedValue({}),
          calculateGlobalCommission: jest.fn().mockReturnValue(0),
        } as any,
        undefined as any,
        {
          firstPointOutsideActiveZones: jest.fn().mockResolvedValue(-1),
          resolveZoneId: jest.fn().mockResolvedValue(10),
        } as any,
        undefined as any,
        undefined as any,
        undefined as any,
      );

      // 3 stops = 1 extra stop (+7 EGP)
      const customCalc = await orderService.calculateCustomDeliveryOrder({
        stops: [
          { lat: 30.96, lng: 31.15, estimatedCost: 50 },
          { lat: 30.97, lng: 31.16, estimatedCost: 20 },
          { lat: 30.98, lng: 31.17, estimatedCost: 0 },
        ],
      } as any);

      expect(customCalc.estimatedItemsCost).toBe(70); // 50 + 20
      expect(customCalc.extraStopFee).toBe(7);
      expect(customCalc.shipping).toBe(34); // 27 base + 7 extra stop
      expect(customCalc.total).toBe(104); // 70 items + 34 delivery
    });
  });

  describe('Scenario 3: Dashboard switches to Flat City-wide Delivery', () => {
    it('Flow: Dashboard sets globalZonePricingEnabled: false -> Store delivery is flat 15 EGP, Custom delivery remains formula-based', async () => {
      const flatSettings = {
        globalZonePricingEnabled: false,
        deliveryCommission: 15,
        shippingKMCharge: 0,
        customDeliveryBaseFee: 12,
        customDeliveryKMCharge: 2.5,
      };

      const mockSettingsService = {
        getSettings: jest.fn().mockResolvedValue(flatSettings),
      };

      const mockZoneService = {
        getZoneDeliveryPriceEntry: jest.fn().mockResolvedValue({ price: 50 }),
        getZoneDeliveryPrice: jest.fn().mockResolvedValue(50),
        resolveZoneId: jest.fn().mockResolvedValue(99),
      };

      const mockPrisma = {
        address: { findUnique: jest.fn().mockResolvedValue({ lat: 30.97, lng: 31.16 }) },
        branch: { findUnique: jest.fn().mockResolvedValue({ lat: 30.95, lng: 31.15 }) },
        zone: { findUnique: jest.fn() },
        settings: { findUnique: jest.fn().mockResolvedValue(null) },
      };

      const helpersService = new HelpersService(
        mockPrisma as any,
        null as any,
        { getDistance: jest.fn().mockResolvedValue(5), getBatchDetails: jest.fn().mockResolvedValue([{ distance: 5 }]) } as any,
        mockSettingsService as any,
        null as any,
        mockZoneService as any,
        {
          getActivePromotionForContext: jest.fn().mockResolvedValue(null),
          applyPromotion: jest.fn().mockImplementation((basePrice: number) => ({
            finalShipping: basePrice,
            originalShipping: basePrice,
            discountAmount: 0,
            isPromotional: false,
            promotionId: null,
            promotionBadgeText: null,
          })),
        } as any,
      );

      // 1. Store delivery uses flat 15 EGP
      const storeDelivery = await helpersService.getDeliveryPrice(1, 9, 100, 99);
      expect(storeDelivery.finalShipping).toBe(15);
      expect(storeDelivery.originalShipping).toBe(15);
      expect(storeDelivery.isPromotional).toBe(false);

      // 2. Custom delivery uses its own formula: 12 base + 5 km * 2.5 = 24.5 EGP
      const customPrice = await helpersService.getCustomDeliveryPrice([
        { lat: 30.0, lng: 31.0 },
        { lat: 30.05, lng: 31.05 },
      ]);
      expect(customPrice).toBe(24.5);
    });
  });

  describe('Scenario 4: Free Delivery Fortune Wheel Reward at Checkout', () => {
    it('Flow: Customer applies free delivery reward -> originalShipping preserved, shipping: 0, hasDeliveryDiscount: true', async () => {
      const mockDeliveryPrice = {
        finalShipping: 25,
        originalShipping: 25,
        discountAmount: 0,
        isPromotional: false,
        promotionId: null,
        promotionBadgeText: null,
      };

      const orderService = new OrderService(
        {
          branch: { findUnique: jest.fn().mockResolvedValue({ maxActiveOrders: null }) },
          order: { count: jest.fn().mockResolvedValue(0) },
          address: { findUnique: jest.fn().mockResolvedValue({ lat: 30.97, lng: 31.16 }) },
        } as any,
        undefined as any,
        {
          validateServiceAvailability: jest.fn().mockResolvedValue({ id: 1, storeId: 5, Store: mockStore }),
          validateSizeAndAddons: jest.fn().mockResolvedValue({ basePrice: 100, addonsPrice: 0 }),
          validateAndPriceBundles: jest.fn().mockResolvedValue([]),
          getTax: jest.fn().mockResolvedValue({ tax: 0, priceAfterTax: 100 }),
          getDeliveryPrice: jest.fn().mockResolvedValue(mockDeliveryPrice),
          verifyCoupon: jest.fn().mockResolvedValue({ totalAfterDiscount: 100, discountValue: 0, couponId: null }),
          verifyFortuneReward: jest.fn().mockResolvedValue({
            freeDelivery: true,
            rewardDiscount: 0,
            rewardId: 88,
          }),
        } as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        { getSettings: jest.fn().mockResolvedValue({ pickupEnabled: true }) } as any,
        undefined as any,
        {
          applyStoreCommission: jest.fn().mockReturnValue({ clientFacingPrice: 100, storeCommissionPerUnit: 0 }),
          getGlobalCommissionSettings: jest.fn().mockResolvedValue({}),
          calculateGlobalCommission: jest.fn().mockReturnValue(0),
        } as any,
        undefined as any,
        { resolveZoneId: jest.fn().mockResolvedValue(5) } as any,
        undefined as any,
        undefined as any,
        undefined as any,
      );

      const result = await orderService.calculateOrder({
        items: [{ serviceId: 1, quantity: 1 }],
        branchId: 9,
        addressId: 1,
        type: OrderType.DELIVERY,
        fortuneRewardId: 88,
      } as any);

      expect(result.shipping).toBe(0);
      expect(result.originalShippingFee).toBe(25);
      expect(result.deliveryDiscountAmount).toBe(25);
      expect(result.hasDeliveryDiscount).toBe(true);
      expect(result.deliveryIsPromotional).toBe(true);
      expect(result.deliveryPromotionBadge).toBe('توصيل مجاني');
      expect(result.isFreeDeliveryFortune).toBe(true);
      expect(result.totalPrice).toBe(100); // 100 items + 0 shipping
    });
  });
});
