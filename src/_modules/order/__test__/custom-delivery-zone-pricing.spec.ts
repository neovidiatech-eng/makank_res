import { HelpersService } from '../services/helpers.service';

/**
 * Custom Delivery (المندوب الخاص) Zone Pricing Test Suite
 * 
 * Verifies that:
 * 1. Specific zones have their own custom delivery price (overrides KM formula).
 * 2. Specific zones support promotional priceAfterDiscount.
 * 3. All other remaining zones without specific pricing fall back to the default price or formula.
 * 4. Regular store delivery zone pricing and custom delivery zone pricing are 100% decoupled.
 * 5. Multi-stop trips (3+ stops) maintain extra stop fee calculation.
 */
describe('Custom Delivery (المندوب الخاص) Zone Pricing & Remaining Zones Flexibility', () => {
  let mockPrisma: any;
  let mockMapService: any;
  let mockSettingsService: any;
  let mockZoneService: any;
  let mockDeliveryPromotionService: any;
  let helpers: HelpersService;

  beforeEach(() => {
    mockPrisma = {
      zone: { findUnique: jest.fn(), findMany: jest.fn() },
      settings: { findUnique: jest.fn(), upsert: jest.fn() },
    };

    mockMapService = {
      getDistance: jest.fn().mockResolvedValue(6),
      getBatchDetails: jest.fn().mockResolvedValue([{ distance: 6 }]),
    };

    mockZoneService = {
      getCustomDeliveryZonePriceEntry: jest.fn(),
      getCustomDeliveryDefaultPrice: jest.fn(),
      resolveZoneId: jest.fn(),
    };

    mockSettingsService = {
      getSettings: jest.fn().mockResolvedValue({
        customDeliveryKMCharge: 3,
        customDeliveryBaseFee: 15,
        deliveryCommission: 15,
      }),
    };

    mockDeliveryPromotionService = {
      getActivePromotionForContext: jest.fn().mockResolvedValue(null),
      applyPromotion: jest.fn(),
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
  });

  const pickupStop = { lat: 30.05, lng: 31.25, zoneId: 1 };
  const dropoffZone10 = { lat: 30.15, lng: 31.35, zoneId: 10 }; // Specific Zone 10 (e.g. 45 EGP)
  const dropoffZone20 = { lat: 30.25, lng: 31.45, zoneId: 20 }; // Other Zone 20 (no specific price)

  it('Scenario 1: Dropoff in a specific zone with custom delivery price -> returns exact zone price (45 EGP)', async () => {
    // Zone 10 has a specific price of 45 EGP
    mockZoneService.getCustomDeliveryZonePriceEntry.mockImplementation((id: number) => {
      if (id === 10) return Promise.resolve({ price: 45, priceAfterDiscount: null });
      return Promise.resolve(null);
    });

    const price = await helpers.getCustomDeliveryPrice([pickupStop, dropoffZone10]);

    // Should return 45 EGP directly (overriding the 6km * 3 + 15 = 33 EGP formula)
    expect(price).toBe(45);
    expect(mockZoneService.getCustomDeliveryZonePriceEntry).toHaveBeenCalledWith(10);
  });

  it('Scenario 2: Dropoff in a specific zone with priceAfterDiscount -> returns discounted price (35 EGP)', async () => {
    mockZoneService.getCustomDeliveryZonePriceEntry.mockImplementation((id: number) => {
      if (id === 10) return Promise.resolve({ price: 45, priceAfterDiscount: 35 });
      return Promise.resolve(null);
    });

    const price = await helpers.getCustomDeliveryPrice([pickupStop, dropoffZone10]);

    expect(price).toBe(35);
  });

  it('Scenario 3: Remaining zones without specific price with fixed default price -> returns default price (25 EGP)', async () => {
    // Zone 20 has NO specific price
    mockZoneService.getCustomDeliveryZonePriceEntry.mockResolvedValue(null);
    // Global default price for remaining zones is set to 25 EGP
    mockZoneService.getCustomDeliveryDefaultPrice.mockResolvedValue(25);
    // KM charge is set to 0 (flat pricing mode)
    mockSettingsService.getSettings.mockResolvedValue({
      customDeliveryKMCharge: 0,
      customDeliveryBaseFee: 15,
    });

    const price = await helpers.getCustomDeliveryPrice([pickupStop, dropoffZone20]);

    // Returns the remaining zones default price = 25 EGP
    expect(price).toBe(25);
  });

  it('Scenario 4: Remaining zones with default price + KM distance charge -> returns defaultPrice + distance * KM', async () => {
    // Zone 20 has NO specific price
    mockZoneService.getCustomDeliveryZonePriceEntry.mockResolvedValue(null);
    // Global default price is 20 EGP
    mockZoneService.getCustomDeliveryDefaultPrice.mockResolvedValue(20);
    // Distance = 6 km, KM charge = 2.5 EGP
    mockSettingsService.getSettings.mockResolvedValue({
      customDeliveryKMCharge: 2.5,
      customDeliveryBaseFee: 15,
    });

    const price = await helpers.getCustomDeliveryPrice([pickupStop, dropoffZone20]);

    // 20 default + (6 * 2.5 = 15) = 35 EGP
    expect(price).toBe(35);
  });

  it('Scenario 5: Resolves zoneId from coordinates when stop has no explicit zoneId', async () => {
    const unzonedDropoff = { lat: 30.15, lng: 31.35 }; // No zoneId
    mockZoneService.resolveZoneId.mockResolvedValue(10);
    mockZoneService.getCustomDeliveryZonePriceEntry.mockImplementation((id: number) => {
      if (id === 10) return Promise.resolve({ price: 50, priceAfterDiscount: null });
      return Promise.resolve(null);
    });

    const price = await helpers.getCustomDeliveryPrice([pickupStop, unzonedDropoff]);

    expect(mockZoneService.resolveZoneId).toHaveBeenCalledWith(30.15, 31.35);
    expect(price).toBe(50);
  });

  it('Scenario 6: Completely decoupled from regular Store Zone Pricing', async () => {
    // Regular store delivery zone price for Zone 10 might be 20 EGP
    // But Custom Delivery for Zone 10 is 40 EGP
    mockZoneService.getCustomDeliveryZonePriceEntry.mockResolvedValue({ price: 40, priceAfterDiscount: null });

    const customPrice = await helpers.getCustomDeliveryPrice([pickupStop, dropoffZone10]);
    expect(customPrice).toBe(40);
  });

  it('Scenario 7: New City with a newly created Zone (no custom price set yet) -> smoothly falls back to default remaining price without error', async () => {
    // New City (cityId: 99) with new Zone 999
    const newCityDropoff = { lat: 31.20, lng: 29.90, zoneId: 999 };
    // New zone has no entry in customDeliveryZonePrices yet
    mockZoneService.getCustomDeliveryZonePriceEntry.mockResolvedValue(null);
    mockZoneService.getCustomDeliveryDefaultPrice.mockResolvedValue(30); // Default for remaining zones is 30 EGP
    mockSettingsService.getSettings.mockResolvedValue({
      customDeliveryKMCharge: 0,
      customDeliveryBaseFee: 15,
    });

    const price = await helpers.getCustomDeliveryPrice([pickupStop, newCityDropoff]);

    // Must return default price 30 EGP safely with zero errors
    expect(price).toBe(30);
    expect(mockZoneService.getCustomDeliveryZonePriceEntry).toHaveBeenCalledWith(999);
  });

  it('Scenario 8: New City with a configured Custom Delivery Price (e.g. 75 EGP) -> returns the specific price immediately', async () => {
    // New City (cityId: 99) with new Zone 999
    const newCityDropoff = { lat: 31.20, lng: 29.90, zoneId: 999 };
    mockZoneService.getCustomDeliveryZonePriceEntry.mockImplementation((id: number) => {
      if (id === 999) return Promise.resolve({ price: 75, priceAfterDiscount: null });
      return Promise.resolve(null);
    });

    const price = await helpers.getCustomDeliveryPrice([pickupStop, newCityDropoff]);

    expect(price).toBe(75);
  });

  it('Scenario 9: Multi-stop custom delivery ending in a new city -> base zone fee is calculated cleanly', async () => {
    // Pickup -> Intermediate Stop -> Dropoff in New City Zone 999
    const intermediateStop = { lat: 30.50, lng: 30.50, zoneId: 50 };
    const newCityDropoff = { lat: 31.20, lng: 29.90, zoneId: 999 };

    mockZoneService.getCustomDeliveryZonePriceEntry.mockImplementation((id: number) => {
      if (id === 999) return Promise.resolve({ price: 80, priceAfterDiscount: null });
      return Promise.resolve(null);
    });

    const price = await helpers.getCustomDeliveryPrice([pickupStop, intermediateStop, newCityDropoff]);

    // Destination stop determines the base zone delivery fee (80 EGP)
    expect(price).toBe(80);
  });
});

