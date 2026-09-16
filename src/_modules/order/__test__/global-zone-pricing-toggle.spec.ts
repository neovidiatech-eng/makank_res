import { HelpersService } from '../services/helpers.service';
import { StoreService } from '../../store/services/store.service';

describe('Global Zone Pricing Toggle (Unified 15 EGP Delivery Fee)', () => {
  describe('HelpersService.getDeliveryPrice', () => {
    let mockPrisma: any;
    let mockSettingsService: any;
    let mockZoneService: any;
    let mockMapService: any;
    let helpers: HelpersService;

    beforeEach(() => {
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
      );

      const price = await helpers.getDeliveryPrice(1, 10, 100, 99);
      expect(price).toBe(15);
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
      );

      const price = await helpers.getDeliveryPrice(1, 10, 100, 99);
      expect(price).toBe(15);
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
      );

      const price = await helpers.getDeliveryPrice(1, 10, 100, 99);
      expect(price).toBe(15);
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
      );

      const price = await helpers.getDeliveryPrice(1, 10, 100, 99);
      expect(price).toBe(40);
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
          if (zoneId === 1) return 20;
          if (zoneId === 2) return 25;
          return 30;
        }),
        getZoneDeliveryPrice: jest.fn().mockResolvedValue(25),
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
        { zoneId: 1, name: 'Zone 1', cityId: 1, price: 15 },
        { zoneId: 2, name: 'Zone 2', cityId: 1, price: 15 },
        { zoneId: 3, name: 'Zone 3', cityId: 1, price: 15 },
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
        { zoneId: 1, name: 'Zone 1', cityId: 1, price: 20 },
        { zoneId: 2, name: 'Zone 2', cityId: 1, price: 25 },
        { zoneId: 3, name: 'Zone 3', cityId: 1, price: 30 },
      ]);
    });
  });
});
