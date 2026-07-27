import { Banner, Language, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  filterJsonKeyWithRawSQL,
  filterKey,
  orderKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterBannerDTO } from '../dto/banner.dto';

// A banner is visible in the scheduling window when each bound is either unset
// or satisfied by `now` (open-ended on either side).
const scheduleWindow = (now: Date): Prisma.BannerWhereInput => ({
  AND: [
    { OR: [{ startDate: null }, { startDate: { lte: now } }] },
    { OR: [{ endDate: null }, { endDate: { gte: now } }] },
  ],
});

export const getBannerArgs = (
  query: FilterBannerDTO,
  languages: Language[],
  isCustomer = false,
) => {
  const { page, limit, orderBy, ...filter } = query;
  const searchArray = [
    filterKey<Banner>(filter, 'id'),
    filterJsonKeyWithRawSQL(filter, 'name', languages),
    filterKey<Banner>(filter, 'storeId'),
    filterKey<Banner>(filter, 'categoryId'),
    filterKey<Banner>(filter, 'serviceId'),
    filterKey<Banner>(filter, 'targetType'),
    filterKey<Banner>(filter, 'active'),
  ].filter(Boolean) as Prisma.BannerWhereInput[];

  // Customers only ever see active banners inside their scheduling window;
  // admins see everything so they can manage scheduled/expired banners.
  if (isCustomer) {
    searchArray.push({ active: true });
    searchArray.push(scheduleWindow(new Date()));
  }

  // Explicit `order` (ascending) drives display order. Customers get a random
  // tiebreaker within the same order so equally-ranked banners still rotate;
  // admins can override via orderBy and otherwise fall back to newest first.
  const orderArray = (
    isCustomer
      ? [{ order: 'asc' }, { randomSeed: 'desc' }]
      : [
          orderKey('order', 'order', orderBy),
          orderKey('clickCount', 'clickCount', orderBy),
          orderKey('startDate', 'startDate', orderBy),
          orderKey('endDate', 'endDate', orderBy),
          orderKey('createdAt', 'createdAt', orderBy),
          orderKey('id', 'id', orderBy),
        ].filter(Boolean)
  ) as Prisma.BannerOrderByWithRelationInput[];

  // Guarantee a deterministic default order for admins.
  if (!isCustomer && orderArray.length === 0) {
    orderArray.push({ order: 'asc' }, { id: 'desc' });
  }

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray,
    where: {
      AND: [...searchArray].filter(Boolean),
    },
  } as Prisma.BannerFindManyArgs;
};

export const selectBannerOBJ = (userId?: Id) => {
  const selectArgs: Prisma.BannerSelect = {
    id: true,
    name: true,
    image: true,
    active: true,
    createdAt: true,
    storeId: true,
    categoryId: true,
    serviceId: true,
    targetType: true,
    clickCount: true,
    order: true,
    startDate: true,
    endDate: true,
    // Explicit Store select (never a broad `include`) so we control exactly
    // which store fields ship to clients. The favorite relation is attached
    // ONLY for a real customer userId; it is collapsed to an `isFavorite`
    // boolean in BannerService.mapBanner and the raw rows are never returned.
    Store: {
      select: {
        id: true,
        name: true,
        logo: true,
        cover: true,
        rating: true,
        review: true,
        freeDelivery: true,
        isVerified: true,
        bestRated: true,
        cityId: true,
        ...(userId
          ? {
              Favorites: {
                where: { customerId: userId },
                select: { customerId: true },
              },
            }
          : {}),
      },
    },
    Category: { select: { id: true, name: true } },
    Service: { select: { id: true, name: true, image: true, price: true } },
    Zones: {
      select: {
        Zone: { select: { id: true, name: true } },
      },
    },
  };
  return selectArgs;
};
export const getBannerArgsWithSelect = (userId?: Id) => {
  return {
    select: selectBannerOBJ(userId),
  } satisfies Prisma.BannerFindManyArgs;
};
