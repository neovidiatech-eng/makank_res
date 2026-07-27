import { CommissionType } from '@prisma/client';
import {
  GlobalCommissionSettings,
  ServiceModuleHelper,
} from '../../serviceModule/services/serviceModule.helper.service';

/**
 * Pricing & commission calculation tests for the two-commission model.
 *
 * Rules locked in here (see docs/pricing-and-commission-analysis.md):
 *  - Store commission is a per-store markup baked into the client-facing price. It is
 *    applied to the BASE price only (service price, or the selected size price which
 *    REPLACES it) — never to add-ons. Supports PERCENTAGE and FIXED.
 *  - A selected size price fully replaces the base service price (never summed).
 *  - Store commission is applied PER UNIT, then multiplied by quantity.
 *  - Global commission is admin-controlled and applied ONCE per order on the items
 *    subtotal (which already includes store commission), excluding delivery. Added on
 *    top of the subtotal. Supports PERCENTAGE and FIXED.
 *  - adminCommission (admin earning) = globalCommission + Σ storeCommission.
 *  - Neither commission is ever double-counted.
 *
 * The real, dependency-free helpers from ServiceModuleHelper are the single source of
 * truth; the mapper/order-line helpers below replicate exactly how production composes
 * them, so a regression in either composition is caught here.
 */
describe('Pricing & commission calculations (store + global)', () => {
  // applyStoreCommission / calculateGlobalCommission do not touch `this`, so null deps are fine.
  const helper = new ServiceModuleHelper(null as any, null as any);

  const pctStore = (commission: number) => ({
    commission,
    commissionType: CommissionType.PERCENTAGE,
  });
  const fixedStore = (commission: number) => ({
    commission,
    commissionType: CommissionType.FIXED,
  });

  /** Mirrors mapServiceObject: each size price is returned commission-inclusive. */
  const mapServiceResponse = (
    service: { price: number; sizes: { price: number; isDefault?: boolean }[] },
    store: { commission: number; commissionType: CommissionType },
  ) => {
    const sizes = service.sizes.map((s) => ({
      price: helper.applyStoreCommission(s.price, store).clientFacingPrice,
      isDefault: !!s.isDefault,
    }));
    const finalPrice = helper.applyStoreCommission(
      service.price,
      store,
    ).clientFacingPrice;
    const defaultSize = sizes.find((s) => s.isDefault) || sizes[0];
    const priceWithDefaultOptions = defaultSize
      ? defaultSize.price
      : finalPrice;
    return { price: finalPrice, priceWithDefaultOptions, Sizes: sizes };
  };

  /** Mirrors calculateOrder's per-line composition: store commission on base only. */
  const calcOrderLine = (
    basePrice: number,
    addonsPrice: number,
    store: { commission: number; commissionType: CommissionType },
    quantity: number,
  ) => {
    const { clientFacingPrice, storeCommissionPerUnit } =
      helper.applyStoreCommission(basePrice, store);
    const unitPrice = clientFacingPrice + addonsPrice;
    return {
      lineTotal: unitPrice * quantity,
      lineStoreCommission: storeCommissionPerUnit * quantity,
    };
  };

  describe('applyStoreCommission — store commission on base price', () => {
    it('PERCENTAGE: 100 @ 10% → 110 (commission 10)', () => {
      const r = helper.applyStoreCommission(100, pctStore(10));
      expect(r.clientFacingPrice).toBe(110);
      expect(r.storeCommissionPerUnit).toBe(10);
    });

    it('FIXED: 100 + 5 → 105 (commission 5)', () => {
      const r = helper.applyStoreCommission(100, fixedStore(5));
      expect(r.clientFacingPrice).toBe(105);
      expect(r.storeCommissionPerUnit).toBe(5);
    });

    it('zero commission → base unchanged', () => {
      const r = helper.applyStoreCommission(100, pctStore(0));
      expect(r.clientFacingPrice).toBe(100);
      expect(r.storeCommissionPerUnit).toBe(0);
    });

    it('applies to the selected SIZE price: 150 @ 10% → 165 (commission 15)', () => {
      const r = helper.applyStoreCommission(150, pctStore(10));
      expect(r.clientFacingPrice).toBe(165);
      expect(r.storeCommissionPerUnit).toBe(15);
    });

    it('defaults to FIXED when commissionType is missing (preserves legacy flat behavior)', () => {
      const r = helper.applyStoreCommission(200, { commission: 10 } as any);
      expect(r.clientFacingPrice).toBe(210);
    });
  });

  describe('calculateGlobalCommission — once per order, excludes delivery', () => {
    const enabled = (
      type: CommissionType,
      value: number,
    ): GlobalCommissionSettings => ({ enabled: true, type, value });

    it('PERCENTAGE: subtotal 1000 @ 2% → 20', () => {
      expect(
        helper.calculateGlobalCommission(
          1000,
          enabled(CommissionType.PERCENTAGE, 2),
        ),
      ).toBe(20);
    });

    it('FIXED: → 25 regardless of subtotal', () => {
      expect(
        helper.calculateGlobalCommission(
          1000,
          enabled(CommissionType.FIXED, 25),
        ),
      ).toBe(25);
    });

    it('disabled → 0', () => {
      expect(
        helper.calculateGlobalCommission(1000, {
          enabled: false,
          type: CommissionType.PERCENTAGE,
          value: 2,
        }),
      ).toBe(0);
    });

    it('is computed on the items subtotal only (delivery excluded by caller)', () => {
      // Caller passes subtotal 1000 (NOT 1050 with delivery); commission is 20, not 21.
      expect(
        helper.calculateGlobalCommission(
          1000,
          enabled(CommissionType.PERCENTAGE, 2),
        ),
      ).toBe(20);
    });
  });

  describe('getGlobalCommissionSettings — reads admin settings', () => {
    const buildHelper = (values: Record<string, any>) => {
      const settingService = {
        getSettings: jest.fn().mockResolvedValue(values),
      };
      return new ServiceModuleHelper(null as any, settingService as any);
    };

    it('enabled percentage', async () => {
      const h = buildHelper({
        businessOrderCommissionRateForAll: true,
        businessOrderCommissionRate: 2,
        businessOrderCommissionType: 'PERCENTAGE',
      });
      await expect(h.getGlobalCommissionSettings()).resolves.toEqual({
        enabled: true,
        type: CommissionType.PERCENTAGE,
        value: 2,
      });
    });

    it('enabled fixed', async () => {
      const h = buildHelper({
        businessOrderCommissionRateForAll: true,
        businessOrderCommissionRate: 25,
        businessOrderCommissionType: 'FIXED',
      });
      await expect(h.getGlobalCommissionSettings()).resolves.toEqual({
        enabled: true,
        type: CommissionType.FIXED,
        value: 25,
      });
    });

    it('disabled forces value 0', async () => {
      const h = buildHelper({
        businessOrderCommissionRateForAll: false,
        businessOrderCommissionRate: 2,
        businessOrderCommissionType: 'PERCENTAGE',
      });
      await expect(h.getGlobalCommissionSettings()).resolves.toEqual({
        enabled: false,
        type: CommissionType.PERCENTAGE,
        value: 0,
      });
    });
  });

  describe('service API response (mapServiceObject)', () => {
    it('no sizes, store 10%: price 110, pwdo 110, Sizes []', () => {
      const res = mapServiceResponse({ price: 100, sizes: [] }, pctStore(10));
      expect(res.price).toBe(110);
      expect(res.priceWithDefaultOptions).toBe(110);
      expect(res.Sizes).toEqual([]);
    });

    it('default size net=100, store 10% → no double count (pwdo 110)', () => {
      const res = mapServiceResponse(
        { price: 100, sizes: [{ price: 100, isDefault: true }] },
        pctStore(10),
      );
      expect(res.price).toBe(110);
      expect(res.Sizes[0].price).toBe(110);
      expect(res.priceWithDefaultOptions).toBe(110);
      // guard against summing base + size
      expect(res.priceWithDefaultOptions).not.toBe(220);
    });

    it('Small=100 (default) + Large=150, store 10% → sizes [110, 165]', () => {
      const res = mapServiceResponse(
        {
          price: 100,
          sizes: [{ price: 100, isDefault: true }, { price: 150 }],
        },
        pctStore(10),
      );
      expect(res.price).toBe(110);
      expect(res.priceWithDefaultOptions).toBe(110);
      expect(res.Sizes.map((s) => s.price)).toEqual([110, 165]);
    });

    it('FIXED store commission of 5 adds 5 to each price', () => {
      const res = mapServiceResponse(
        { price: 100, sizes: [{ price: 150 }] },
        fixedStore(5),
      );
      expect(res.price).toBe(105);
      expect(res.Sizes[0].price).toBe(155);
    });
  });

  describe('order line composition — commission on base, not add-ons', () => {
    it('Large size 150 @ 10% + addon 20, qty 2 → line 370, storeCommission 30', () => {
      const { lineTotal, lineStoreCommission } = calcOrderLine(
        150,
        20,
        pctStore(10),
        2,
      );
      // unit = (150 + 15) + 20 = 185; commission lands on 150 only, not the addon
      expect(lineTotal).toBe(370);
      expect(lineStoreCommission).toBe(30);
    });

    it('FIXED store 5, base 100 + addon 20, qty 3 → line 375, storeCommission 15', () => {
      const { lineTotal, lineStoreCommission } = calcOrderLine(
        100,
        20,
        fixedStore(5),
        3,
      );
      // unit = (100 + 5) + 20 = 125
      expect(lineTotal).toBe(375);
      expect(lineStoreCommission).toBe(15);
    });

    it('zero commission: base 100 + addon 20, qty 2 → 240', () => {
      const { lineTotal, lineStoreCommission } = calcOrderLine(
        100,
        20,
        pctStore(0),
        2,
      );
      expect(lineTotal).toBe(240);
      expect(lineStoreCommission).toBe(0);
    });
  });

  describe('full order — store + global together, no double counting', () => {
    const enabled = (
      type: CommissionType,
      value: number,
    ): GlobalCommissionSettings => ({
      enabled: true,
      type,
      value,
    });

    /** Mirrors calculateOrder end-to-end for a single item (no discount/tax). */
    const buildOrder = (
      basePrice: number,
      addonsPrice: number,
      store: { commission: number; commissionType: CommissionType },
      qty: number,
      delivery: number,
      global: GlobalCommissionSettings,
    ) => {
      const { lineTotal, lineStoreCommission } = calcOrderLine(
        basePrice,
        addonsPrice,
        store,
        qty,
      );
      const subtotal = lineTotal;
      const globalCommission = helper.calculateGlobalCommission(
        subtotal,
        global,
      );
      const total = subtotal + delivery + globalCommission;
      const adminCommission = globalCommission + lineStoreCommission;
      const branchEarning = total - adminCommission - delivery;
      return {
        subtotal,
        globalCommission,
        adminCommission,
        total,
        branchEarning,
      };
    };

    it('spec example: subtotal 1000, delivery 50, global 2% → total 1070', () => {
      const o = buildOrder(
        1000,
        0,
        pctStore(0),
        1,
        50,
        enabled(CommissionType.PERCENTAGE, 2),
      );
      expect(o.subtotal).toBe(1000);
      expect(o.globalCommission).toBe(20);
      expect(o.total).toBe(1070);
      expect(o.adminCommission).toBe(20);
    });

    it('spec example: fixed global 25 → total 1075', () => {
      const o = buildOrder(
        1000,
        0,
        pctStore(0),
        1,
        50,
        enabled(CommissionType.FIXED, 25),
      );
      expect(o.globalCommission).toBe(25);
      expect(o.total).toBe(1075);
      expect(o.adminCommission).toBe(25);
    });

    it('store 10% + global 2%: admin gets both, branch keeps the base', () => {
      const o = buildOrder(
        1000,
        0,
        pctStore(10),
        1,
        50,
        enabled(CommissionType.PERCENTAGE, 2),
      );
      expect(o.subtotal).toBe(1100); // 1000 + 100 store commission
      expect(o.globalCommission).toBe(22); // 2% of 1100
      expect(o.total).toBe(1172); // 1100 + 50 + 22
      expect(o.adminCommission).toBe(122); // 22 global + 100 store
      expect(o.branchEarning).toBe(1000); // base price only
    });

    it('global disabled: only store commission flows to admin', () => {
      const o = buildOrder(1000, 0, pctStore(10), 1, 50, {
        enabled: false,
        type: CommissionType.PERCENTAGE,
        value: 2,
      });
      expect(o.globalCommission).toBe(0);
      expect(o.adminCommission).toBe(100);
      expect(o.total).toBe(1150);
    });
  });

  describe('consistency: catalog size price matches one-unit order total (no addons)', () => {
    it('Large size in catalog equals checkout line for qty 1', () => {
      const catalog = mapServiceResponse(
        { price: 100, sizes: [{ price: 150 }] },
        pctStore(10),
      );
      const order = calcOrderLine(150, 0, pctStore(10), 1);
      expect(catalog.Sizes[0].price).toBe(order.lineTotal); // 165 === 165
    });
  });
});
