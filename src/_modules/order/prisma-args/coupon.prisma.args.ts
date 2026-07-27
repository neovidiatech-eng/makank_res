import { Prisma } from '@prisma/client';

export const selectCouponOBJ = (storeId: Id, userId: Id) => {
  const selectArgs: Prisma.CouponSelect = {
    id: true,
    type: true,
    startDate: true,
    endDate: true,
    usageCount: true,
    maxUsage: true,
    minOrderAmount: true,
    discountType: true,
    discountValue: true,
    maxDiscountValue: true,
    active: true,
    StoreCoupons: {
      where: {
        storeId,
      },
      select: {
        storeId: true,
      },
    },
    UserCoupons: {
      where: {
        userId,
      },
      select: {
        userId: true,
      },
    },
    Orders: {
      where: {
        userId,
        status: { notIn: ['CANCELLED', 'REJECTED', 'PAYMENT_FAILD'] },
      },
    },
    CouponZones: {
      select: {
        zoneId: true,
      },
    },
  };
  return selectArgs;
};

export type SelectCouponObjType = Prisma.CouponGetPayload<{
  select: ReturnType<typeof selectCouponOBJ>;
}>;
