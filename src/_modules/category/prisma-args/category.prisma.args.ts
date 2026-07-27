import { Category, Language, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  filterJsonKeyWithRawSQL,
  filterKey,
  orderKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterCategoryDTO } from '../dto/category.dto';

export const getCategoryArgs = (
  query: FilterCategoryDTO,
  languages: Language[],
) => {
  const { orderBy, page, limit, isCustomStoreCategory, ...filter } = query;

  const searchArray = [
    filterKey<Category>(filter, 'id'),
    filterJsonKeyWithRawSQL<Category>(filter, 'name', languages),
    filter.storeId && {
      storeId: filter.storeId,
    },
    // isCustomStoreCategory=true  → storeId IS NOT NULL (store-owned category)
    // isCustomStoreCategory=false → storeId IS NULL (global template category)
    isCustomStoreCategory === true && { storeId: { not: null } },
    isCustomStoreCategory === false && { templateCategoryId: { not: null } },
  ].filter(Boolean) as Prisma.CategoryWhereInput[];

  const orderArray = [
    orderKey('order', 'order', orderBy),
    orderKey('id', 'id', orderBy),
  ].filter(Boolean) as Prisma.CategoryOrderByWithRelationInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray,
    where: { AND: searchArray },
  } as Prisma.CategoryFindManyArgs;
};

export const selectCategoryOBJ = () => {
  const selectArgs: Prisma.CategorySelect = {
    id: true,
    name: true,
    createdAt: true,
    active: true,
    image: true,
    order: true,
    storeId: true,
    templateCategoryId: true,
  };
  return selectArgs;
};

export const getCategoryArgsWithSelect = () => {
  return {
    select: selectCategoryOBJ(),
  } satisfies Prisma.CategoryFindManyArgs;
};
