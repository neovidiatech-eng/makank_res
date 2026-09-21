import { CouponType, DiscountType } from '@prisma/client';
import { CouponService } from '../coupon.service';
import { HelpersService } from '../../order/services/helpers.service';
import {
  getUserCouponArgs,
  SelectUserCouponObj,
} from '../../user/prisma-args/user.prisma-select';

/**
 * End-to-End Cross-Stack Simulation: Dashboard -> Backend -> Mobile
 *
 * Verifies the full coupon lifecycle:
 *  1. Dashboard form payload generation & validation against CouponService.create.
 *  2. Customer coupon discovery (GET /users/me/coupon) via getUserCouponArgs & SelectUserCouponObj.
 *  3. Mobile checkout calculation & validation (calculateOrder -> isCouponValid & extractDiscount).
 */
describe('E2E Stack Simulation: Dashboard -> Backend -> Mobile Coupon Flow', () => {
  // --------------------------------------------------------------------------
  // Phase 1: Dashboard Payload -> Backend Coupon Creation
  // --------------------------------------------------------------------------
  describe('Phase 1: Dashboard creation flow simulation', () => {
    const buildCouponService = () => {
      const createdCoupons: any[] = [];
      const createdZones: any[] = [];

      const tx = {
        coupon: {
          create: jest.fn(async ({ data }: any) => {
            const record = { id: createdCoupons.length + 1, ...data };
            createdCoupons.push(record);
            return record;
          }),
        },
        storeCoupons: { createMany: jest.fn() },
        userCoupons: { createMany: jest.fn() },
        couponZones: {
          createMany: jest.fn(async ({ data }: any) => {
            createdZones.push(...data);
            return { count: data.length };
          }),
        },
      };

      const prisma = {
        $transaction: jest.fn(async (cb: any) => cb(tx)),
      };

      const service = new CouponService(
        prisma as any,
        null as any,
        null as any,
        null as any,
      );

      return { service, tx, createdCoupons, createdZones };
    };

    it('Dashboard submits FIRST_ORDER coupon with zoneIds (usageCount omitted) -> created with usageCount: 0 and linked zones', async () => {
      const { service, tx, createdCoupons, createdZones } = buildCouponService();

      // Exact structure emitted by Dashboard useCouponsLogic onSubmit
      const dashboardPayload = {
        title: { en: 'Welcome Discount', ar: 'خصم ترحيبي' },
        code: 'WELCOME20',
        type: CouponType.FIRST_ORDER,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        maxDiscountValue: 50,
        minDiscountValue: 0,
        minOrderAmount: 100,
        maxUsage: 1000,
        // usageCount omitted or undefined from dashboard
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-10-01T00:00:00.000Z'),
        zoneIds: [101], // Mahalla Zone
      };

      await service.create(dashboardPayload as any);

      expect(createdCoupons[0].code).toBe('WELCOME20');
      expect(createdCoupons[0].usageCount).toBe(0);
      expect(tx.couponZones.createMany).toHaveBeenCalledWith({
        data: [{ zoneId: 101, couponId: 1 }],
      });
      expect(createdZones).toEqual([{ zoneId: 101, couponId: 1 }]);
    });

    it('Dashboard submits ALL_USERS fixed amount coupon for Tanta -> created successfully', async () => {
      const { service, tx, createdCoupons, createdZones } = buildCouponService();

      const dashboardPayload = {
        title: { en: 'Tanta Flat 30', ar: 'خصم طنطا 30 ج' },
        code: 'TANTA30',
        type: CouponType.ALL_USERS,
        discountType: DiscountType.AMOUNT,
        discountValue: 30,
        maxDiscountValue: 30,
        minDiscountValue: 0,
        minOrderAmount: 80,
        maxUsage: 200,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-10-01T00:00:00.000Z'),
        zoneIds: [201], // Tanta Zone
      };

      await service.create(dashboardPayload as any);

      expect(createdCoupons[0].code).toBe('TANTA30');
      expect(createdCoupons[0].usageCount).toBe(0);
      expect(tx.couponZones.createMany).toHaveBeenCalledWith({
        data: [{ zoneId: 201, couponId: 1 }],
      });
    });
  });

  // --------------------------------------------------------------------------
  // Phase 2: Customer Discovery Contract (GET /users/me/coupon)
  // --------------------------------------------------------------------------
  describe('Phase 2: Customer coupon discovery contract (GET /users/me/coupon)', () => {
    it('SelectUserCouponObj projects all essential fields required by Mobile CouponModel', () => {
      const select = SelectUserCouponObj();
      expect(select.id).toBe(true);
      expect(select.title).toBe(true);
      expect(select.code).toBe(true);
      expect(select.type).toBe(true);
      expect(select.discountType).toBe(true);
      expect(select.discountValue).toBe(true);
      expect(select.maxDiscountValue).toBe(true);
      expect(select.minDiscountValue).toBe(true);
      expect(select.minOrderAmount).toBe(true);
      expect(select.startDate).toBe(true);
      expect(select.endDate).toBe(true);
      expect(select.maxUsage).toBe(true);
      expect(select.usageCount).toBe(true);
      expect(select.CouponZones).toBeDefined();
    });

    it('new customer (0 orders) receives FIRST_ORDER coupons in query', () => {
      const args = getUserCouponArgs({ page: 1, limit: 10 } as any, 123, true);
      const typesIncluded = args.where.OR
        .map((cond: any) => cond.type)
        .filter(Boolean);

      expect(typesIncluded).toContain(CouponType.FIRST_ORDER);
      expect(typesIncluded).toContain(CouponType.ALL_USERS);
    });

    it('returning customer (1+ orders) has FIRST_ORDER coupons excluded from query', () => {
      const args = getUserCouponArgs({ page: 1, limit: 10 } as any, 456, false);
      const typesIncluded = args.where.OR
        .map((cond: any) => cond.type)
        .filter(Boolean);

      expect(typesIncluded).not.toContain(CouponType.FIRST_ORDER);
      expect(typesIncluded).toContain(CouponType.ALL_USERS);
    });

    it('coupons already used by the customer are excluded from discovery', () => {
      const args = getUserCouponArgs({ page: 1, limit: 10 } as any, 789, true);
      const ordersFilter = args.where.Orders;

      expect(ordersFilter).toEqual({
        none: {
          userId: 789,
          status: { notIn: ['CANCELLED', 'REJECTED', 'PAYMENT_FAILD'] },
        },
      });
    });
  });

  // --------------------------------------------------------------------------
  // Phase 3: Mobile Checkout Calculation & Rejection Flow (HelpersService)
  // --------------------------------------------------------------------------
  describe('Phase 3: Mobile Checkout order calculation & business rule verification', () => {
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
      id: 1,
      code: 'WELCOME20',
      type: CouponType.FIRST_ORDER,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      maxDiscountValue: 50,
      minDiscountValue: 0,
      minOrderAmount: 100,
      maxUsage: 1000,
      usageCount: 0,
      startDate: new Date(Date.now() - 3600000),
      endDate: new Date(Date.now() + 3600000),
      active: true,
      CouponZones: [{ zoneId: 101 }], // Mahalla only
      Orders: [],
      StoreCoupons: [],
      UserCoupons: [],
    };

    it('Scenario 3.1: New customer in Mahalla (zone 101) with subtotal 200 EGP applies WELCOME20 -> SUCCESS (40 EGP discount)', async () => {
      const helpers = buildHelpers(0); // 0 past orders

      // 1. Validation passes
      await expect(
        helpers.isCouponValid(firstOrderCoupon as any, 200, 101, 123),
      ).resolves.not.toThrow();

      // 2. Discount extracted
      const result = helpers.extractDiscount(firstOrderCoupon as any, 200);
      expect(result.discountValue).toBe(40); // 20% of 200 = 40 (<= max 50)
      expect(result.totalAfterDiscount).toBe(160);
    });

    it('Scenario 3.2: Customer in Tanta (zone 201) tries to apply Mahalla coupon -> REJECTED (invalid zone)', async () => {
      const helpers = buildHelpers(0);

      await expect(
        helpers.isCouponValid(firstOrderCoupon as any, 200, 201, 123),
      ).rejects.toThrow('Coupon is not valid for this delivery zone');
    });

    it('Scenario 3.3: Returning customer with past orders tries to apply FIRST_ORDER coupon -> REJECTED', async () => {
      const helpers = buildHelpers(2); // 2 past orders

      await expect(
        helpers.isCouponValid(firstOrderCoupon as any, 200, 101, 456),
      ).rejects.toThrow('Coupon is valid for first order only');
    });

    it('Scenario 3.4: Customer cart subtotal is below minOrderAmount (80 < 100) -> REJECTED', async () => {
      const helpers = buildHelpers(0);

      await expect(
        helpers.isCouponValid(firstOrderCoupon as any, 80, 101, 123),
      ).rejects.toThrow(
        'Coupon cannot be used with this order amount because of minOrderAmount',
      );
    });

    it('Scenario 3.5: Customer already used this coupon in a previous order -> REJECTED', async () => {
      const helpers = buildHelpers(0);
      const alreadyUsedCoupon = {
        ...firstOrderCoupon,
        Orders: [{ id: 999, userId: 123 }],
      };

      await expect(
        helpers.isCouponValid(alreadyUsedCoupon as any, 200, 101, 123),
      ).rejects.toThrow('Coupon has already been used by this user');
    });
  });
});
