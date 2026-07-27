import {
  BundleFreeValueRule,
  BundlePricingMode,
  BundleScopeRole,
  BundleSizeRule,
  BundleType,
  CommissionType,
} from '@prisma/client';
import { ServiceModuleHelper } from '../../serviceModule/services/serviceModule.helper.service';
import { HelpersService } from '../services/helpers.service';

describe('Bundle checkout pricing', () => {
  const serviceHelper = new ServiceModuleHelper(null as any, null as any);
  const store = { commission: 10, commissionType: CommissionType.PERCENTAGE };
  const services = {
    paid: { id: 10, categoryId: 100, storeId: 1, Store: store },
    free: { id: 20, categoryId: 200, storeId: 1, Store: store },
    otherStore: { id: 30, categoryId: 200, storeId: 2, Store: store },
  };

  const selected = (
    basePrice: number,
    addonsPrice = 0,
    name: Json = { en: 'Medium', ar: 'متوسط' },
  ) => ({
    size: { id: 1, name, price: basePrice },
    addons: addonsPrice ? [{ id: 9, price: addonsPrice }] : [],
    basePrice,
    addonsPrice,
    totalPrice: basePrice + addonsPrice,
  });

  const bundle = (
    freeValueRule: BundleFreeValueRule = BundleFreeValueRule.CAP_TO_CHEAPEST_PAID,
  ): any => ({
    id: 1,
    storeId: 1,
    title: { en: 'Pizza offer', ar: 'عرض بيتزا' },
    type: BundleType.BUY_X_GET_Y_FREE,
    requiredPaidQuantity: 2,
    freeQuantity: 1,
    paidSizeRule: BundleSizeRule.ANY,
    freeSizeRule: BundleSizeRule.ANY,
    paidRequiredSizeName: null,
    freeRequiredSizeName: null,
    freeValueRule,
    maxFreeItemValue:
      freeValueRule === BundleFreeValueRule.MAX_FREE_VALUE ? 80 : null,
    ScopeServices: [
      { role: BundleScopeRole.PAID, serviceId: 10 },
      { role: BundleScopeRole.FREE, serviceId: 20 },
    ],
    ScopeCategories: [],
  });

  const buildHelpers = (configuredBundle: any = bundle()) => {
    const prisma = {
      bundle: { findFirst: jest.fn().mockResolvedValue(configuredBundle) },
    };
    const helpers = new HelpersService(
      prisma as any,
      null as any,
      null as any,
      null as any,
      serviceHelper,
      null as any,
    );
    jest
      .spyOn(helpers, 'validateServiceAvailability')
      .mockImplementation(async (serviceId) => {
        const service = Object.values(services).find(
          (candidate) => candidate.id === serviceId,
        );
        if (!service) throw new Error('Service not found');
        return service as any;
      });
    jest
      .spyOn(helpers, 'validateSizeAndAddons')
      .mockImplementation(async (serviceId, sizeId) => {
        if (sizeId === 999) throw new Error('Size not found for this service');
        return selected(
          serviceId === 10 ? 100 : 70,
          serviceId === 20 && sizeId === 2 ? 15 : 0,
        );
      });
    return helpers;
  };

  const validSelection = () => ({
    bundleId: 1,
    paidItems: [{ serviceId: 10, quantity: 2 }],
    freeItems: [{ serviceId: 20, quantity: 1 }],
  });

  it('rejects paid and free quantity mismatches', async () => {
    const helpers = buildHelpers();
    await expect(
      helpers.validateAndPriceBundles(
        [{ ...validSelection(), paidItems: [{ serviceId: 10, quantity: 1 }] }],
        1,
        1,
      ),
    ).rejects.toThrow('Paid bundle quantity');
    await expect(
      helpers.validateAndPriceBundles(
        [{ ...validSelection(), freeItems: [{ serviceId: 20, quantity: 2 }] }],
        1,
        1,
      ),
    ).rejects.toThrow('Free bundle quantity');
  });

  it('rejects out-of-scope and cross-store items', async () => {
    const helpers = buildHelpers();
    await expect(
      helpers.validateAndPriceBundles(
        [{ ...validSelection(), freeItems: [{ serviceId: 10, quantity: 1 }] }],
        1,
        1,
      ),
    ).rejects.toThrow('not eligible');
    await expect(
      helpers.validateAndPriceBundles([validSelection()], 1, 2),
    ).rejects.toThrow('does not belong');
  });

  it('rejects fake sizes and NAME-rule mismatches', async () => {
    const helpers = buildHelpers();
    await expect(
      helpers.validateAndPriceBundles(
        [
          {
            ...validSelection(),
            freeItems: [{ serviceId: 20, sizeId: 999, quantity: 1 }],
          },
        ],
        1,
        1,
      ),
    ).rejects.toThrow('Size not found');
    const namedBundle = {
      ...bundle(),
      freeSizeRule: BundleSizeRule.NAME,
      freeRequiredSizeName: 'Large',
    };
    await expect(
      buildHelpers(namedBundle).validateAndPriceBundles(
        [validSelection()],
        1,
        1,
      ),
    ).rejects.toThrow('A size is required');
  });

  it.each([
    [BundleFreeValueRule.CAP_TO_CHEAPEST_PAID, 100, true],
    [BundleFreeValueRule.MAX_FREE_VALUE, 80, true],
    [BundleFreeValueRule.NO_CAP, Infinity, false],
  ])('applies %s free-value limits', async (rule, limit, rejects) => {
    const helpers = buildHelpers(bundle(rule));
    jest
      .spyOn(helpers, 'validateSizeAndAddons')
      .mockImplementation(async (serviceId) =>
        selected(serviceId === 10 ? 100 : 120),
      );
    const priced = helpers.validateAndPriceBundles([validSelection()], 1, 1);
    if (rejects) await expect(priced).rejects.toThrow('exceeds');
    else await expect(priced).resolves.toHaveLength(1);
  });

  it('zeroes only free base price and charges its addons', async () => {
    const helpers = buildHelpers();
    const [pricedBundle] = await helpers.validateAndPriceBundles(
      [
        {
          ...validSelection(),
          freeItems: [{ serviceId: 20, sizeId: 2, quantity: 1 }],
        },
      ],
      1,
      1,
    );
    expect(pricedBundle.freeItems[0].itemTotalPrice).toBe(15);
    expect(pricedBundle.freeItems[0].originalBaseValue).toBe(70);
    expect(pricedBundle.freeDiscountAmount).toBe(70);
  });

  it('ignores client-supplied prices', async () => {
    const helpers = buildHelpers();
    const [pricedBundle] = await helpers.validateAndPriceBundles(
      [
        {
          ...validSelection(),
          paidItems: [{ serviceId: 10, quantity: 2, price: 1 } as any],
        },
      ],
      1,
      1,
    );
    expect(pricedBundle.paidItems[0].itemTotalPrice).toBe(220);
  });

  it('applies FIXED pricing mode with priceAfterDiscount (uses fixed offer price + commission)', async () => {
    const fixedBundle = {
      ...bundle(),
      pricingMode: BundlePricingMode.FIXED,
      priceBeforeDiscount: 180,
      priceAfterDiscount: 140,
    };
    const helpers = buildHelpers(fixedBundle);
    const [pricedBundle] = await helpers.validateAndPriceBundles(
      [
        {
          ...validSelection(),
          paidItems: [{ serviceId: 10, quantity: 2 }],
        },
      ],
      1,
      1,
    );

    // Store has 10% percentage commission.
    // 140 EGP fixed offer -> 140 * 1.1 = 154 EGP client-facing price.
    // Allocated to first paid item; free item is 0 base.
    expect(pricedBundle.paidItems[0].itemTotalPrice).toBe(154);
    expect(pricedBundle.paidItems[0].storeCommission).toBe(14);
    expect(pricedBundle.snapshot.pricingMode).toBe(BundlePricingMode.FIXED);
    expect(pricedBundle.snapshot.priceBeforeDiscount).toBe(180);
    expect(pricedBundle.snapshot.priceAfterDiscount).toBe(140);
  });
});
