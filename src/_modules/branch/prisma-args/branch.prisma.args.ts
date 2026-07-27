import { Branch, Language, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  filterJsonKeyWithRawSQL,
  filterKey,
  orderKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterBranchDTO } from '../dto/branch.dto';

export const getBranchArgs = (
  query: FilterBranchDTO,
  languages: Language[],
) => {
  const { orderBy, page, limit, ...filter } = query;
  const searchArray = [
    filterKey<Branch>(filter, 'id'),
    filterKey<Branch>(filter, 'storeId'),
    filterJsonKeyWithRawSQL<Branch>(filter, 'name', languages),
    filterKey<Branch>(filter, 'isActive'),
    filterKey<Branch>(filter, 'closed'),
    filterKey<Branch>(filter, 'temporarilyClosed'),
    { deletedAt: null },
  ].filter(Boolean) as Prisma.BranchWhereInput[];

  const orderArray = [
    orderKey('id', 'id', orderBy),
    orderKey('rating', 'rating', orderBy),
  ].filter(Boolean) as Prisma.BranchOrderByWithRelationInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray,
    where: {
      AND: searchArray,
    },
  } as Prisma.BranchFindManyArgs;
};

export const selectBranchOBJ = (): Prisma.BranchSelect => {
  return {
    id: true,
    storeId: true,
    name: true,
    phone: true,
    address: true,
    lat: true,
    lng: true,
    isActive: true,
    closed: true,
    status: true,
    busyUntil: true,
    statusReason: true,
    rating: true,
    review: true,
    bestRated: true,
    temporarilyClosed: true,
    storeSchedule: true,
    Store: {
      select: {
        id: true,
        name: true,
        logo: true,
      },
    },
    BranchZones: {
      select: {
        Zone: { select: { id: true, name: true } },
      },
    },
  };
};
