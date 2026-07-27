import { CouponType, DiscountType } from '@prisma/client';
import { CouponService } from '../../coupon/coupon.service';
import { HelpersService } from '../services/helpers.service';

/**
 * Coupon zone restrictions + the AMOUNT-discount clamp.
 *
 * isCouponValid / extractDiscount are pure over the selected coupon object, so
 * the HelpersService is built with null collaborators — nothing else is touched.
 *
 * Locks in:
 *  - AMOUNT discount can never exceed the amount it applies to (no negative total).
 *  - A coupon with NO CouponZones is global: valid for any zoneId, including null.
 *  - A zone-restricted coupon passes only when zoneId matches a linked zone.
 *  - A zone-restricted coupon is rejected for a non-matching zone AND for a null
 *    zone (PICKUP / address outside every active zone).
 *  - CouponService.update zone semantics: omit = keep, [] = clear, [ids] = replace.
 */
describe('Coupon — zone restrictions', () => {
  const helpers = new HelpersService(
    null as any, // prisma
    null as any, // globalHelpers
    null as any, // mapService
    null as any, // settingService
    null as any, // serviceHelper
    null as any, // zoneService
  );

  // A coupon that passes every non-zone check; tweak per test.
  const baseCoupon = (overrides: any = {}) => ({
    id: 1,
    type: CouponType.ALL_USERS,
    startDate: new Date(Date.now() - 86_400_000), // yesterday
    endDate: new Date(Date.now() + 86_400_000), // tomorrow
    usageCount: 0,
    maxUsage: 10,
    minOrderAmount: 0,
    discountType: DiscountType.AMOUNT,
    discountValue: 10,
    maxDiscountValue: 1000,
    active: true,
    StoreCoupons: [],
    UserCoupons: [],
    Orders: [],
    CouponZones: [],
    ...overrides,
  });

  describe('extractDiscount — clamp', () => {
    it('AMOUNT discount larger than subtotal is clamped (no negative total)', () => {
      const coupon = baseCoupon({
        discountType: DiscountType.AMOUNT,
        discountValue: 500,
      });
      const result = helpers.extractDiscount(coupon as any, 200);
      expect(result.discountValue).toBe(200);
      expect(result.totalAfterDiscount).toBe(0);
    });

    it('AMOUNT discount below subtotal is applied as-is', () => {
      const coupon = baseCoupon({
        discountType: DiscountType.AMOUNT,
        discountValue: 50,
      });
      const result = helpers.extractDiscount(coupon as any, 200);
      expect(result.discountValue).toBe(50);
      expect(result.totalAfterDiscount).toBe(150);
    });
  });

  describe('isCouponValid — zone gating', () => {
    it('global coupon (no CouponZones) passes for a real zone', () => {
      expect(() =>
        helpers.isCouponValid(baseCoupon() as any, 100, 5),
      ).not.toThrow();
    });

    it('global coupon (no CouponZones) passes when zoneId is null', () => {
      expect(() =>
        helpers.isCouponValid(baseCoupon() as any, 100, null),
      ).not.toThrow();
    });

    it('zone-restricted coupon passes when zoneId matches a linked zone', () => {
      const coupon = baseCoupon({
        CouponZones: [{ zoneId: 5 }, { zoneId: 7 }],
      });
      expect(() => helpers.isCouponValid(coupon as any, 100, 7)).not.toThrow();
    });

    it('zone-restricted coupon is rejected for a non-matching zone', () => {
      const coupon = baseCoupon({
        CouponZones: [{ zoneId: 5 }, { zoneId: 7 }],
      });
      expect(() => helpers.isCouponValid(coupon as any, 100, 9)).toThrow(
        'Coupon is not valid for this delivery zone',
      );
    });

    it('zone-restricted coupon is rejected when zoneId is null (PICKUP / no zone)', () => {
      const coupon = baseCoupon({
        CouponZones: [{ zoneId: 5 }],
      });
      expect(() => helpers.isCouponValid(coupon as any, 100, null)).toThrow(
        'Coupon is not valid for this delivery zone',
      );
    });
  });
});

describe('CouponService.update — zone restriction semantics', () => {
  const buildService = () => {
    const tx = {
      coupon: {
        update: jest
          .fn()
          .mockResolvedValue({ id: 1, type: CouponType.ALL_USERS }),
      },
      storeCoupons: { deleteMany: jest.fn(), createMany: jest.fn() },
      userCoupons: { deleteMany: jest.fn(), createMany: jest.fn() },
      couponZones: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = new CouponService(
      prisma as any,
      null as any, // Language
      null as any, // adminNotificationService
      null as any, // notificationService
    );
    return { service, tx };
  };

  it('omitting zoneIds leaves zone links untouched', async () => {
    const { service, tx } = buildService();
    await service.update(1, { discountValue: 15 } as any);
    expect(tx.couponZones.deleteMany).not.toHaveBeenCalled();
    expect(tx.couponZones.createMany).not.toHaveBeenCalled();
  });

  it('empty zoneIds clears all zone links (coupon becomes global)', async () => {
    const { service, tx } = buildService();
    await service.update(1, { zoneIds: [] } as any);
    expect(tx.couponZones.deleteMany).toHaveBeenCalledWith({
      where: { couponId: 1 },
    });
    expect(tx.couponZones.createMany).not.toHaveBeenCalled();
  });

  it('non-empty zoneIds replaces zone links', async () => {
    const { service, tx } = buildService();
    await service.update(1, { zoneIds: [3] } as any);
    expect(tx.couponZones.deleteMany).toHaveBeenCalledWith({
      where: { couponId: 1 },
    });
    expect(tx.couponZones.createMany).toHaveBeenCalledWith({
      data: [{ zoneId: 3, couponId: 1 }],
    });
  });
});
