import { DeliveryRating, Prisma, StoreRating } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterRatingDTO } from '../dto/rating.dto';

export const getStoreRatingArgs = (query: FilterRatingDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<StoreRating>(filter, 'id'),
    filterKey<StoreRating>(filter, 'branchId'),
    filterKey<StoreRating>(filter, 'userId'),
    filterKey<StoreRating>(filter, 'orderId'),
    filterKey<StoreRating>(filter, 'storeId'),
  ].filter(Boolean) as Prisma.StoreRatingWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    where: {
      AND: searchArray,
    },
  } as Prisma.StoreRatingFindManyArgs;
};

export const getDeliveryRatingArgs = (query: FilterRatingDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<DeliveryRating>(filter, 'id'),
    filterKey<DeliveryRating>(filter, 'deliveryId'),
    filterKey<DeliveryRating>(filter, 'userId'),
    filterKey<DeliveryRating>(filter, 'orderId'),
  ].filter(Boolean) as Prisma.DeliveryRatingWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    where: {
      AND: searchArray,
    },
  } as Prisma.DeliveryRatingFindManyArgs;
};

export const selectStoreRatingOBJ = (): Prisma.StoreRatingSelect => ({
  id: true,
  rating: true,
  comment: true,
  branchId: true,
  storeId: true,
  userId: true,
  orderId: true,
  createdAt: true,
  Branch: true,
  store: true,
  Customer: {
    select: {
      id: true,
      name: true,
      image: true,
    },
  },
});

export const selectDeliveryRatingOBJ = (): Prisma.DeliveryRatingSelect => ({
  id: true,
  rating: true,
  comment: true,
  deliveryId: true,
  userId: true,
  orderId: true,
  createdAt: true,
  Delivery: true,
  Customer: {
    select: {
      id: true,
      name: true,
      image: true,
    },
  },
});

export const getStoreRatingArgsWithSelect = (query: FilterRatingDTO) => {
  return {
    ...getStoreRatingArgs(query),
    select: selectStoreRatingOBJ(),
  } satisfies Prisma.StoreRatingFindManyArgs;
};

export const getDeliveryRatingArgsWithSelect = (query: FilterRatingDTO) => {
  return {
    ...getDeliveryRatingArgs(query),
    select: selectDeliveryRatingOBJ(),
  } satisfies Prisma.DeliveryRatingFindManyArgs;
};
