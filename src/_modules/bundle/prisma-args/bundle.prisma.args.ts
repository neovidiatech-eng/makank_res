import { Bundle, Prisma } from '@prisma/client';
import { selectServiceOBJ, selectServiceOBJById } from 'src/_modules/serviceModule/prisma-args/service.prisma.args';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey, orderKey } from 'src/globals/helpers/prisma-filters';
import { FilterBundleDTO } from '../dto/bundle.dto';

export const validBundleWhere = (): Prisma.BundleWhereInput => {
  const now = new Date();
  return {
    isActive: true,
    deletedAt: null,
    AND: [
      { OR: [{ startDate: null }, { startDate: { lte: now } }] },
      { OR: [{ endDate: null }, { endDate: { gte: now } }] },
    ],
  };
};

export const selectBundleOBJ = (): Prisma.BundleSelect => ({
  id: true,
  storeId: true,
  title: true,
  description: true,
  image: true,
  isActive: true,
  type: true,
  requiredPaidQuantity: true,
  freeQuantity: true,
  paidSizeRule: true,
  paidRequiredSizeName: true,
  freeSizeRule: true,
  freeRequiredSizeName: true,
  freeValueRule: true,
  maxFreeItemValue: true,
  pricingMode: true,
  priceBeforeDiscount: true,
  priceAfterDiscount: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  ScopeServices: {
    select: {
      role: true,
      serviceId: true,
      Service: { select: selectServiceOBJById() },
    },
  },
});

export const getBundleArgs = (
  filters: FilterBundleDTO,
  includeInactive = false,
) => {
  const { orderBy, page, limit, ...filter } = filters;
  const where = [
    filterKey<Bundle>(filter, 'id'),
    filterKey<Bundle>(filter, 'storeId'),
    filter.isActive !== undefined && { isActive: filter.isActive },
    !includeInactive && validBundleWhere(),
  ].filter(Boolean) as Prisma.BundleWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, filter.id),
    orderBy: [
      orderKey('id', 'id', orderBy),
      orderKey('createdAt', 'createdAt', orderBy),
    ].filter(Boolean),
    where: { AND: where },
    select: selectBundleOBJ(),
  } satisfies Prisma.BundleFindManyArgs;
};
