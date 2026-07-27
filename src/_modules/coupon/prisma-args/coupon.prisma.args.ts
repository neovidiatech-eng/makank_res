import { Coupon, Language, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  filterJsonKeyWithRawSQL,
  filterKey,
  orderKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterCouponDTO } from '../dto/coupon.dto';

export const getCouponArgs = (
  query: FilterCouponDTO,
  languages: Language[],
) => {
  const { orderBy, page, limit, ...filter } = query;
  const searchArray = [
    filterKey<Coupon>(filter, 'id'),
    filterKey<Coupon>(filter, 'code'),
    filterKey<Coupon>(filter, 'type'),
    filterKey<Coupon>(filter, 'discountType'),
    filterKey<Coupon>(filter, 'discountValue'),
    filterKey<Coupon>(filter, 'maxUsage'),
    filterKey<Coupon>(filter, 'usageCount'),
    filterKey<Coupon>(filter, 'minOrderAmount'),
    filterKey<Coupon>(filter, 'startDate'),
    filterKey<Coupon>(filter, 'endDate'),
    filterKey<Coupon>(filter, 'minDiscountValue'),
    filterKey<Coupon>(filter, 'maxDiscountValue'),
    filter?.userId && {
      UserCoupons: {
        some: { userId: filter?.userId },
      },
    },
    filter?.storeId && {
      StoreCoupons: {
        some: { storeId: filter.storeId },
      },
    },
    filterJsonKeyWithRawSQL<Coupon>(filter, 'title', languages),
  ].filter(Boolean) as Prisma.CouponWhereInput[];

  const orderArray = [
    orderKey('id', 'id', orderBy),
    orderKey('code', 'code', orderBy),
    orderKey('type', 'type', orderBy),
    orderKey('discountType', 'discountType', orderBy),
    orderKey('discountValue', 'discountValue', orderBy),
    orderKey('maxUsage', 'maxUsage', orderBy),
    orderKey('usageCount', 'usageCount', orderBy),
    orderKey('minOrderAmount', 'minOrderAmount', orderBy),
    orderKey('freeDelivery', 'freeDelivery', orderBy),
    orderKey('startDate', 'startDate', orderBy),
    orderKey('endDate', 'endDate', orderBy),
    orderKey('minDiscountValue', 'minDiscountValue', orderBy),
    orderKey('maxDiscountValue', 'maxDiscountValue', orderBy),
  ].filter(Boolean) as Prisma.CouponOrderByWithRelationInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray,
    where: {
      AND: searchArray,
    },
  } as Prisma.CouponFindManyArgs;
};

export const selectCouponOBJ = () => {
  const selectArgs: Prisma.CouponSelect = {
    id: true,
    title: true,
    code: true,
    type: true,
    discountType: true,
    discountValue: true,
    maxUsage: true,
    usageCount: true,
    minOrderAmount: true,
    startDate: true,
    endDate: true,
    minDiscountValue: true,
    maxDiscountValue: true,
    createdAt: true,
    // Zone restriction summary so admins can see at a glance whether a coupon is
    // global (empty) or limited to specific zones.
    CouponZones: {
      select: { zoneId: true, Zone: { select: { id: true, name: true } } },
    },
  };
  return selectArgs;
};
export const selectCouponByIdOBJ = (id: Id) => {
  const selectArgs: Prisma.CouponSelect = {
    ...selectCouponOBJ(),
    UserCoupons: true,
    StoreCoupons: true,
  };
  return selectArgs;
};
export const getCouponArgsWithSelect = (id?: Id) => {
  return {
    select: id ? selectCouponByIdOBJ(id) : selectCouponOBJ(),
  } satisfies Prisma.CouponFindManyArgs;
};
