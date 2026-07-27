import { Language, Prisma, StoreRating } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterStoreRatingDTO } from '../dto/storeRating.dto';

export const getStoreRatingArgs = (
  query: FilterStoreRatingDTO,
  languages: Language[],
) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<StoreRating>(filter, 'id'),
    filterKey<StoreRating>(filter, 'branchId'),
    filterKey<StoreRating>(filter, 'userId'),
  ].filter(Boolean) as Prisma.StoreRatingWhereInput[];
  return {
    ...paginateOrNot({ limit, page }, query?.id),
    where: {
      AND: searchArray,
    },
  } as Prisma.StoreRatingFindManyArgs;
};

export const selectStoreRatingOBJ = () => {
  const selectArgs: Prisma.StoreRatingSelect = {
    id: true,
    rating: true,
    branchId: true,
    userId: true,
    Branch: true,
    Customer: true,
  };
  return selectArgs;
};
export const getStoreRatingArgsWithSelect = () => {
  return {
    select: selectStoreRatingOBJ(),
  } satisfies Prisma.StoreRatingFindManyArgs;
};
