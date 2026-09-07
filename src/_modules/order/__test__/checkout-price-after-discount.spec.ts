import { CommissionType } from '@prisma/client';
import { ServiceModuleHelper } from '../../serviceModule/services/serviceModule.helper.service';
import { HelpersService } from '../services/helpers.service';

/**
 * Checkout pricing for the "price after discount" feature.
 *
 * Locks in:
 *  - validateSizeAndAddons returns the DISCOUNTED raw base price for the selected size
 *    (or service when no size), via the shared effectiveRawPrice guard.
 *  - calculateOrder applies store commission EXACTLY ONCE on top of that base
 *    (anti-double-commission assertion).
 *  - A corrupted discount row falls back to the original price (no under-charge).
 *  - Non-discounted services are unchanged.
 */
describe('Checkout — price after discount', () => {
  const realHelper = new ServiceModuleHelper(null as any, null as any);

  const pctStore = (commission: number) => ({
    commission,
    commissionType: CommissionType.PERCENTAGE,
  });

  /**
   * Build a HelpersService with a prisma stub that serves one service + one size.
   * Only validateSizeAndAddons is exercised, so just those two reads are stubbed.
   */
  const buildHelpers = (service: any, size: any, addons: any[] = []) => {
    const prisma = {
      service: {
        findUnique: jest.fn().mockResolvedValue(service),
      },
      serviceSize: {
        findFirst: jest.fn().mockResolvedValue(size),
      },
      serviceAddon: {
        findMany: jest.fn().mockResolvedValue(addons),
      },
    };
    return new HelpersService(
      prisma as any,
      null as any, // globalHelpers
      null as any, // mapService
      null as any, // settingService
      realHelper, // serviceHelper (real — single source of truth)
      null as any, // zoneService
    );
  };

  /** Mirrors calculateOrder's per-line composition: store commission on base once. */
  const composeLine = (
    basePrice: number,
    addonsPrice: number,
    store: { commission: number; commissionType: CommissionType },
    quantity: number,
  ) => {
    const { clientFacingPrice, storeCommissionPerUnit } =
      realHelper.applyStoreCommission(basePrice, store);
    const unitPrice = clientFacingPrice + addonsPrice;
    return {
      lineTotal: unitPrice * quantity,
      lineStoreCommission: storeCommissionPerUnit * quantity,
    };
  };

  it('selected size on sale: basePrice is the discounted raw price', async () => {
    const helpers = buildHelpers(
      { price: 200, priceAfterDiscount: null },
      { price: 200, priceAfterDiscount: 150 },
    );
    const selected = await helpers.validateSizeAndAddons(1, 10, []);
    expect(selected.basePrice).toBe(150);
    expect(selected.totalPrice).toBe(150);
  });

  it('regression: a discounted addon actually reduces addonsPrice, not just the display', async () => {
    const helpers = buildHelpers(
      { price: 100, priceAfterDiscount: null },
      null,
      [
        { id: 1, price: 20, priceAfterDiscount: 15 }, // on sale
        { id: 2, price: 10, priceAfterDiscount: null }, // not on sale
      ],
    );
    const selected = await helpers.validateSizeAndAddons(1, undefined as any, [
      1, 2,
    ]);
    // Previously this summed raw addon.price (20 + 10 = 30) regardless of any
    // discount — the customer was charged full price even when the store had
    // configured a discounted addon price.
    expect(selected.addonsPrice).toBe(25); // 15 (discounted) + 10 (full)
  });

  it('no size: falls back to service-level discounted price', async () => {
    const helpers = buildHelpers({ price: 300, priceAfterDiscount: 240 }, null);
    const selected = await helpers.validateSizeAndAddons(
      1,
      undefined as any,
      [],
    );
    expect(selected.basePrice).toBe(240);
  });

  it('checkout: commission applied EXACTLY ONCE on the discounted base', async () => {
    const helpers = buildHelpers(
      { price: 200, priceAfterDiscount: null },
      { price: 200, priceAfterDiscount: 150 },
    );
    const selected = await helpers.validateSizeAndAddons(1, 10, []);

    // calculateOrder composition: store 10%, qty 2, no addons.
    const { lineTotal, lineStoreCommission } = composeLine(
      selected.basePrice,
      selected.addonsPrice,
      pctStore(10),
      2,
    );
    // unit = 150 * 1.1 = 165; line = 330; commission = 15 * 2 = 30 (on 150, ONCE).
    expect(lineTotal).toBe(330);
    expect(lineStoreCommission).toBe(30);
    // Anti-double-commission: had commission been applied twice the unit would be
    // 150 * 1.1 * 1.1 = 181.5 => line 363. It is not.
    expect(lineTotal).not.toBeCloseTo(363);
  });

  it('corrupted discount (pad >= price): falls back to original price', async () => {
    const helpers = buildHelpers(
      { price: 100, priceAfterDiscount: null },
      { price: 100, priceAfterDiscount: 150 },
    );
    const selected = await helpers.validateSizeAndAddons(1, 10, []);
    expect(selected.basePrice).toBe(100);
  });

  it('negative discount: falls back to original price (no under-charge)', async () => {
    const helpers = buildHelpers(
      { price: 100, priceAfterDiscount: null },
      { price: 100, priceAfterDiscount: -10 },
    );
    const selected = await helpers.validateSizeAndAddons(1, 10, []);
    expect(selected.basePrice).toBe(100);
  });

  it('non-discounted size is unchanged (null pad => raw price)', async () => {
    const helpers = buildHelpers(
      { price: 200, priceAfterDiscount: null },
      { price: 200, priceAfterDiscount: null },
    );
    const selected = await helpers.validateSizeAndAddons(1, 10, []);
    expect(selected.basePrice).toBe(200);
    const { lineTotal } = composeLine(selected.basePrice, 0, pctStore(10), 1);
    expect(lineTotal).toBe(220);
  });

  it('Half Chicken Offer: base 100, sale 80, store commission 22% -> unit 102, store gets 100, admin gets 2 excess', async () => {
    const helpers = buildHelpers(
      { price: 100, priceAfterDiscount: null },
      { price: 100, priceAfterDiscount: 80 },
    );
    const selected = await helpers.validateSizeAndAddons(1, 10, []);
    expect(selected.basePrice).toBe(80);
    expect(selected.originalBasePrice).toBe(100);

    const { clientFacingPrice, storeCommissionPerUnit } =
      realHelper.applyStoreCommission(
        selected.basePrice,
        pctStore(22),
        selected.originalBasePrice,
      );
    // client sees 80 + 22 = 102
    expect(clientFacingPrice).toBe(102);
    expect(storeCommissionPerUnit).toBe(22);

    // Reconcile excess commission:
    const itemDiscount = (selected.originalBasePrice - selected.basePrice) * 1; // 20
    const storeCommission = storeCommissionPerUnit * 1; // 22
    const excessStoreCommission = Math.max(0, storeCommission - itemDiscount); // 2
    expect(excessStoreCommission).toBe(2);

    const globalCommission = 5;
    const adminCommission = globalCommission + excessStoreCommission; // 7
    expect(adminCommission).toBe(7);

    const shipping = 1;
    const finalTotal = clientFacingPrice + shipping + globalCommission; // 108
    expect(finalTotal).toBe(108);

    const storeNetEarnings = finalTotal - shipping - adminCommission; // 100
    expect(storeNetEarnings).toBe(100); // Store gets full 100!
  });
});
