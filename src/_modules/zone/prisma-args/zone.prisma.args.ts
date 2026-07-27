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

  const pagination = paginateOrNot({ limit, page }, query?.id);
  if (pagination && limit !== undefined) {
    pagination.take = limit === -1 ? undefined : limit;
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
  };
  return selectArgs;
};

export const getZoneArgsWithSelect = () => {
  return {
    select: selectZoneOBJ(),
  } satisfies Prisma.ZoneFindManyArgs;
};
