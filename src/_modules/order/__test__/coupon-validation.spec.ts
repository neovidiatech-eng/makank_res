import { CouponType, DiscountType } from '@prisma/client';
import { HelpersService } from '../services/helpers.service';
import { getUserCouponArgs, SelectUserCouponObj } from '../../user/prisma-args/user.prisma-select';

describe('Coupon Validation & Customer Listing', () => {
  describe('isCouponValid — FIRST_ORDER logic', () => {
    const buildHelpers = (pastOrderCount: number) => {
      const prisma = {
        order: {
          count: jest.fn().mockResolvedValue(pastOrderCount),
        },
      };
      return new HelpersService(
        prisma as any,
        null as any,
        null as any,
        null as any,
        null as any,
        null as any,
        null as any,
      );
    };

    const firstOrderCoupon = {
      id: 10,
      code: 'FIRST10',
      type: CouponType.FIRST_ORDER,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      maxDiscountValue: 100,
      minDiscountValue: 0,
      minOrderAmount: 50,
      maxUsage: 100,
      usageCount: 0,
      startDate: new Date(Date.now() - 3600000),
      endDate: new Date(Date.now() + 3600000),
      active: true,
      CouponZones: [],
      Orders: [],
    };

    it('allows FIRST_ORDER coupon when customer has 0 previous orders', async () => {
      const helpers = buildHelpers(0);
      await expect(
        helpers.isCouponValid(firstOrderCoupon as any, 100, null, 123),
      ).resolves.not.toThrow();
    });

    it('rejects FIRST_ORDER coupon when customer has previous orders', async () => {
      const helpers = buildHelpers(2);
      await expect(
        helpers.isCouponValid(firstOrderCoupon as any, 100, null, 123),
      ).rejects.toThrow('Coupon is valid for first order only');
    });

    it('rejects coupon if already used by this user (Orders array has entry)', async () => {
      const helpers = buildHelpers(0);
      const usedCoupon = {
        ...firstOrderCoupon,
        Orders: [{ id: 999 }],
      };
      await expect(
        helpers.isCouponValid(usedCoupon as any, 100, null, 123),
      ).rejects.toThrow('Coupon has already been used by this user');
    });
  });

  describe('getUserCouponArgs — customer coupon selection & filtering', () => {
    it('selects full discount and validity details for mobile display', () => {
      const select = SelectUserCouponObj();
      expect(select.id).toBe(true);
      expect(select.code).toBe(true);
      expect(select.title).toBe(true);
      expect(select.discountType).toBe(true);
      expect(select.discountValue).toBe(true);
      expect(select.maxDiscountValue).toBe(true);
      expect(select.minOrderAmount).toBe(true);
      expect(select.startDate).toBe(true);
      expect(select.endDate).toBe(true);
      expect(select.CouponZones).toBeDefined();
    });

    it('filters out expired, future, and already-used coupons', () => {
      const args = getUserCouponArgs({ page: 1, limit: 10 } as any, 50, false);
      expect(args.where.active).toBe(true);
      expect(args.where.expired).toBe(false);
      expect(args.where.startDate).toBeDefined();
      expect(args.where.endDate).toBeDefined();
      expect(args.where.Orders).toEqual({
        none: {
          userId: 50,
          status: { notIn: ['CANCELLED', 'REJECTED', 'PAYMENT_FAILD'] },
        },
      });
      // Should NOT include FIRST_ORDER when isFirstOrder is false
      expect(args.where.OR).toEqual([
        {
          type: CouponType.USER_WISE,
          UserCoupons: { some: { userId: 50 } },
        },
        {
          type: CouponType.ALL_USERS,
        },
      ]);
    });

    it('includes FIRST_ORDER coupons when isFirstOrder is true', () => {
      const args = getUserCouponArgs({ page: 1, limit: 10 } as any, 50, true);
      expect(args.where.OR).toEqual([
        {
          type: CouponType.USER_WISE,
          UserCoupons: { some: { userId: 50 } },
        },
        {
          type: CouponType.ALL_USERS,
        },
        {
          type: CouponType.FIRST_ORDER,
        },
      ]);
    });
  });
});
