import { Language, Prisma, Zone } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  filterJsonKeyWithRawSQL,
  filterKey,
  orderKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterZoneDTO } from '../dto/zone.dto';

export const getZoneArgs = (query: FilterZoneDTO, languages: Language[]) => {
  const { orderBy, page, limit, ...filter } = query;
  const searchArray = [
    filterKey<Zone>(filter, 'id'),
    filterKey<Zone>(filter, 'active'),
    filterKey<Zone>(filter, 'cityId'),
    filterJsonKeyWithRawSQL<Zone>(filter, 'name', languages),
  ].filter(Boolean) as Prisma.ZoneWhereInput[];

  const orderArray = [orderKey('id', 'id', orderBy)].filter(
    Boolean,
  ) as Prisma.ZoneOrderByWithRelationInput[];

  let pagination: { take?: number; skip?: number } | undefined;

  if (limit !== undefined) {
    const numLimit = Number(limit);
    if (numLimit === -1) {
      pagination = undefined;
    } else {
      const parsedPage = page ? Math.max(1, Number(page)) : 1;
      pagination = {
        take: numLimit,
        skip: (parsedPage - 1) * numLimit,
      };
    }
  } else if (page !== undefined) {
    pagination = paginateOrNot({ limit, page }, query?.id);
  } else {
    // When neither limit nor page is provided (e.g. fetching zones for a city),
    // return all zones so none are omitted.
    pagination = undefined;
  }

  return {
    ...pagination,
    orderBy: orderArray,
    where: { AND: searchArray },
  } as Prisma.ZoneFindManyArgs;
};

export const selectZoneOBJ = () => {
  const selectArgs: Prisma.ZoneSelect = {
    id: true,
    name: true,
    coordinates: true,
    createdAt: true,
    active: true,
    cityId: true,
    deliveryPrice: true,
    deliveryPriceAfterDiscount: true,
  };
  return selectArgs;
};

export const getZoneArgsWithSelect = () => {
  return {
    select: selectZoneOBJ(),
  } satisfies Prisma.ZoneFindManyArgs;
};
