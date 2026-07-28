import { CommissionType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateServiceDTO, UpdateServiceDTO } from '../dto/service.dto';
import { SizeDTO } from '../dto/size.dto';
import { ServiceModuleHelper } from '../services/serviceModule.helper.service';

/**
 * "Price after discount" for services & service sizes.
 *
 * Invariants locked here:
 *  - effectiveRawPrice picks the discount ONLY when valid, BEFORE any commission.
 *  - A corrupted row (pad >= price, or pad < 0) silently falls back to `price` —
 *    never throws, never under/over-charges (guard proof).
 *  - Serialization exposes original `price`, `priceAfterDiscount`, `effectivePrice`,
 *    `hasDiscount`; `priceWithDefaultOptions` reflects the default size's discount.
 *  - Store commission is applied EXACTLY ONCE per pipeline (no double-commission).
 *  - Non-discounted services are byte-for-byte unchanged.
 */
describe('Service price-after-discount', () => {
  // The discount/commission helpers do not touch `this`-injected deps.
  const helper = new ServiceModuleHelper(null as any, null as any);

  const pctStore = (commission: number) => ({
    commission,
    commissionType: CommissionType.PERCENTAGE,
  });
  const fixedStore = (commission: number) => ({
    commission,
    commissionType: CommissionType.FIXED,
  });

  /** Direct exercise of the production mapper. */
  const mapService = (
    service: {
      price: number;
      priceAfterDiscount?: number | null;
      Sizes?: {
        price: number;
        priceAfterDiscount?: number | null;
        isDefault?: boolean;
      }[];
    },
    store: { commission: number; commissionType: CommissionType },
  ) =>
    (helper as any).mapServiceObject({
      ...service,
      Store: store,
      Sizes: service.Sizes ?? [],
      Addons: [],
    });

  describe('pure helpers — hasValidDiscount / effectiveRawPrice', () => {
    it('null/undefined discount => invalid, falls back to price', () => {
      expect(helper.hasValidDiscount(100, null)).toBe(false);
      expect(helper.hasValidDiscount(100, undefined)).toBe(false);
      expect(helper.effectiveRawPrice(100, null)).toBe(100);
      expect(helper.effectiveRawPrice(100, undefined)).toBe(100);
    });

    it('valid discount (0 <= pad < price) => used', () => {
      expect(helper.hasValidDiscount(100, 80)).toBe(true);
      expect(helper.effectiveRawPrice(100, 80)).toBe(80);
      // boundary: 0 is a valid (free) sale price
      expect(helper.hasValidDiscount(100, 0)).toBe(true);
      expect(helper.effectiveRawPrice(100, 0)).toBe(0);
    });

    it('equal to price => invalid (must be strictly less)', () => {
      expect(helper.hasValidDiscount(100, 100)).toBe(false);
      expect(helper.effectiveRawPrice(100, 100)).toBe(100);
    });

    it('greater than price => invalid, falls back to price', () => {
      expect(helper.hasValidDiscount(100, 150)).toBe(false);
      expect(helper.effectiveRawPrice(100, 150)).toBe(100);
    });

    it('negative => invalid, falls back to price (never throws)', () => {
      expect(helper.hasValidDiscount(100, -10)).toBe(false);
      expect(() => helper.effectiveRawPrice(100, -10)).not.toThrow();
      expect(helper.effectiveRawPrice(100, -10)).toBe(100);
    });
  });

  describe('serialization — mapServiceObject', () => {
    it('no discount: effectivePrice === price, hasDiscount false, pad null', () => {
      const res = mapService(
        { price: 100, priceAfterDiscount: null, Sizes: [] },
        pctStore(10),
      );
      expect(res.price).toBe(110);
      expect(res.effectivePrice).toBe(110);
      expect(res.priceAfterDiscount).toBeNull();
      expect(res.hasDiscount).toBe(false);
      // pwdo unchanged vs. legacy (no sizes => base effective price)
      expect(res.priceWithDefaultOptions).toBe(110);
    });

    it('base discount 150->120 @ 10%: price 165, effective 132, pad 132', () => {
      const res = mapService(
        { price: 150, priceAfterDiscount: 120, Sizes: [] },
        pctStore(10),
      );
      expect(res.price).toBe(165); // 150 * 1.1
      expect(res.effectivePrice).toBe(132); // 120 * 1.1
      expect(res.priceAfterDiscount).toBe(132);
      expect(res.hasDiscount).toBe(true);
      expect(res.priceWithDefaultOptions).toBe(132);
    });

    it('size discount drives priceWithDefaultOptions (default size on sale)', () => {
      const res = mapService(
        {
          price: 200,
          Sizes: [
            { price: 200, priceAfterDiscount: 150, isDefault: true },
            { price: 300 },
          ],
        },
        pctStore(10),
      );
      const def = res.Sizes[0];
      expect(def.price).toBe(220); // original list price (commission-inclusive)
      expect(def.effectivePrice).toBe(165); // 150 * 1.1
      expect(def.priceAfterDiscount).toBe(165);
      expect(def.hasDiscount).toBe(true);
      // non-discounted second size is unchanged
      expect(res.Sizes[1].price).toBe(330);
      expect(res.Sizes[1].effectivePrice).toBe(330);
      expect(res.Sizes[1].hasDiscount).toBe(false);
      expect(res.Sizes[1].priceAfterDiscount).toBeNull();
      // headline reflects the discounted default size
      expect(res.priceWithDefaultOptions).toBe(165);
    });

    it('service with sizes and no base discount sets top-level price equal to default size price (prevents fake mobile app discount badge)', () => {
      const res = mapService(
        {
          price: 140, // Base product price entered on create
          Sizes: [
            { price: 35, isDefault: true },
            { price: 70 },
            { price: 140 },
          ],
        },
        pctStore(0),
      );
      // Top-level price equals the default size list price (35), matching priceWithDefaultOptions (35)
      expect(res.price).toBe(35);
      expect(res.priceWithDefaultOptions).toBe(35);
      expect(res.hasDiscount).toBe(false);
    });

    it('effectivePrice/hasDiscount/priceAfterDiscount follow the default size too, not just price (regression: was contradicting price:0 with effectivePrice:120)', () => {
      const res = mapService(
        {
          price: 120, // base price, would leak through as a stale effectivePrice
          priceAfterDiscount: null,
          Sizes: [{ price: 0, priceAfterDiscount: null, isDefault: false }],
        },
        pctStore(0),
      );
      // Only size present (even though not flagged isDefault) becomes the default —
      // price, effectivePrice, priceAfterDiscount, hasDiscount must all agree at 0/null,
      // never mixing the size's price with the base service's effectivePrice.
      expect(res.price).toBe(0);
      expect(res.effectivePrice).toBe(0);
      expect(res.priceAfterDiscount).toBeNull();
      expect(res.hasDiscount).toBe(false);
      expect(res.priceWithDefaultOptions).toBe(0);
    });

    it('commission applied EXACTLY ONCE (no double-commission on discount)', () => {
      // FIXED store +5: effective = (120 + 5) = 125, not (120 + 5 + 5)
      const res = mapService(
        { price: 150, priceAfterDiscount: 120, Sizes: [] },
        fixedStore(5),
      );
      expect(res.effectivePrice).toBe(125);
      expect(res.priceAfterDiscount).toBe(125);
      expect(res.price).toBe(155);
    });
  });

  describe('corrupted-data safety (guard proof)', () => {
    it('pad >= price: no throw, hasDiscount false, effective === price', () => {
      let res: any;
      expect(() => {
        res = mapService(
          {
            price: 100,
            Sizes: [{ price: 100, priceAfterDiscount: 150, isDefault: true }],
          },
          pctStore(0),
        );
      }).not.toThrow();
      expect(res.Sizes[0].hasDiscount).toBe(false);
      expect(res.Sizes[0].effectivePrice).toBe(100);
      expect(res.Sizes[0].priceAfterDiscount).toBeNull();
    });

    it('negative pad: no throw, hasDiscount false, effective === price', () => {
      let res: any;
      expect(() => {
        res = mapService(
          {
            price: 100,
            Sizes: [{ price: 100, priceAfterDiscount: -10, isDefault: true }],
          },
          pctStore(0),
        );
      }).not.toThrow();
      expect(res.Sizes[0].hasDiscount).toBe(false);
      expect(res.Sizes[0].effectivePrice).toBe(100);
      expect(res.priceWithDefaultOptions).toBe(100);
    });
  });

  describe('DTO validation', () => {
    const validSizes = [
      { name: { en: 'S', ar: 'ص' }, price: 100, isDefault: true },
    ];
    const baseCreate = {
      name: { en: 'svc', ar: 'خ' },
      description: { en: 'd', ar: 'و' },
      durationMinutes: 30,
      price: 200,
      status: 'ACTIVE',
      categoryId: 1,
      Sizes: validSizes,
    };

    const errorsFor = (cls: any, payload: any) =>
      validateSync(plainToInstance(cls, payload), {
        skipMissingProperties: false,
      });

    it('service create with valid discount passes', () => {
      const errs = errorsFor(CreateServiceDTO, {
        ...baseCreate,
        priceAfterDiscount: 150,
      });
      expect(
        errs.find((e) => e.property === 'priceAfterDiscount'),
      ).toBeUndefined();
    });

    it('service discount equal to price fails', () => {
      const errs = errorsFor(CreateServiceDTO, {
        ...baseCreate,
        priceAfterDiscount: 200,
      });
      expect(errs.some((e) => e.property === 'priceAfterDiscount')).toBe(true);
    });

    it('service discount greater than price fails', () => {
      const errs = errorsFor(CreateServiceDTO, {
        ...baseCreate,
        priceAfterDiscount: 250,
      });
      expect(errs.some((e) => e.property === 'priceAfterDiscount')).toBe(true);
    });

    it('negative service discount throws on transform', () => {
      // @ValidateNullableNumber throws eagerly for negatives, matching @ValidateNumber.
      expect(() =>
        plainToInstance(CreateServiceDTO, {
          ...baseCreate,
          priceAfterDiscount: -5,
        }),
      ).toThrow();
    });

    it('service update CLEARING discount (present empty => null) is valid', () => {
      const dto: any = plainToInstance(UpdateServiceDTO, {
        price: 200,
        priceAfterDiscount: '',
      });
      expect(dto.priceAfterDiscount).toBeNull();
      const errs = validateSync(dto, { skipMissingProperties: true });
      expect(errs.some((e) => e.property === 'priceAfterDiscount')).toBe(false);
    });

    it('service update OMITTING discount stays undefined (Prisma no-op)', () => {
      const dto: any = plainToInstance(UpdateServiceDTO, { price: 200 });
      expect(dto.priceAfterDiscount).toBeUndefined();
    });

    it('size discount valid passes; equal/greater fail', () => {
      expect(
        validateSync(
          plainToInstance(SizeDTO, {
            name: { en: 'S' },
            price: 100,
            priceAfterDiscount: 80,
          }),
        ).some((e) => e.property === 'priceAfterDiscount'),
      ).toBe(false);

      expect(
        validateSync(
          plainToInstance(SizeDTO, {
            name: { en: 'S' },
            price: 100,
            priceAfterDiscount: 100,
          }),
        ).some((e) => e.property === 'priceAfterDiscount'),
      ).toBe(true);

      expect(
        validateSync(
          plainToInstance(SizeDTO, {
            name: { en: 'S' },
            price: 100,
            priceAfterDiscount: 150,
          }),
        ).some((e) => e.property === 'priceAfterDiscount'),
      ).toBe(true);
    });
  });

  describe('size-discount removal (delete + recreate, no stale discount)', () => {
    it('recreating a size WITHOUT priceAfterDiscount yields no discount', () => {
      // Start on sale {price:200, pad:150}; serialization shows the discount.
      const onSale = mapService(
        {
          price: 200,
          Sizes: [{ price: 200, priceAfterDiscount: 150, isDefault: true }],
        },
        pctStore(0),
      );
      expect(onSale.Sizes[0].hasDiscount).toBe(true);
      expect(onSale.Sizes[0].effectivePrice).toBe(150);

      // Service update deletes + recreates the size with the field OMITTED. The
      // recreated row column is NULL (omitted spread), so on re-read:
      const afterUpdate = mapService(
        {
          price: 200,
          Sizes: [{ price: 200, priceAfterDiscount: null, isDefault: true }],
        },
        pctStore(0),
      );
      expect(afterUpdate.Sizes[0].hasDiscount).toBe(false);
      expect(afterUpdate.Sizes[0].effectivePrice).toBe(200);
      expect(afterUpdate.Sizes[0].priceAfterDiscount).toBeNull();
      expect(afterUpdate.priceWithDefaultOptions).toBe(200);
    });
  });

  describe('regression: base discount + undiscounted default size (no "see 120, pay 150")', () => {
    it('list headline (priceWithDefaultOptions) follows the default SIZE, not the base discount', () => {
      // Admin put a discount on the service base (150 -> 120) but left the default
      // size at full price (150, no discount). Now selectServiceOBJ loads Sizes for
      // list views, so the mapper sees the default size.
      const store = pctStore(10);
      const listView = mapService(
        {
          price: 150,
          priceAfterDiscount: 120,
          Sizes: [{ price: 150, priceAfterDiscount: null, isDefault: true }],
        },
        store,
      );

      // What checkout will actually charge for that default size (raw -> commission once).
      const checkoutUnit = helper.applyStoreCommission(
        helper.effectiveRawPrice(150, null), // = 150 (size has no discount)
        store,
      ).clientFacingPrice;
      expect(checkoutUnit).toBe(165); // 150 * 1.1

      // The advertised purchasable price MUST equal what checkout charges...
      expect(listView.priceWithDefaultOptions).toBe(checkoutUnit); // 165, not 132
      // ...and MUST NOT be the discounted base headline (would be the "see 120/132" bug).
      expect(listView.priceWithDefaultOptions).not.toBe(132);

      // The default size itself carries no discount.
      expect(listView.Sizes[0].hasDiscount).toBe(false);
      expect(listView.Sizes[0].effectivePrice).toBe(165);
      expect(listView.Sizes[0].priceAfterDiscount).toBeNull();

      // The base service-level fields still expose the headline discount as a starting
      // price — that is fine; it is NOT the purchasable default-options price.
      expect(listView.price).toBe(165);
      expect(listView.effectivePrice).toBe(132);
      expect(listView.hasDiscount).toBe(true);
    });
  });
});
