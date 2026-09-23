import { City, Language, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  filterJsonKeyWithRawSQL,
  filterKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterCityDTO } from '../dto/city.dto';

export const getCityArgs = (query: FilterCityDTO, languages: Language[]) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<City>(filter, 'id'),
    filter.active !== undefined
      ? filterKey<City>(filter, 'active')
      : { active: true },
    filterJsonKeyWithRawSQL<City>(filter, 'name', languages),
  ].filter(Boolean) as Prisma.CityWhereInput[];
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
    // When neither limit nor page is provided (e.g. mobile apps / dropdown selectors),
    // do not paginate or clamp to 10; return all active cities so all cities appear.
    pagination = undefined;
  }

  return {
    ...pagination,
    where: {
      AND: searchArray,
    },
  } as Prisma.CityFindManyArgs;
};

export const selectCityOBJ = () => {
  const selectArgs: Prisma.CitySelect = {
    id: true,
    name: true,
    lat: true,
    lng: true,
    radius: true,
    toleranceRadius: true,
    coordinates: true,
    active: true,
  };
  return selectArgs;
};
export const getCityArgsWithSelect = () => {
  return {
    select: selectCityOBJ(),
  } satisfies Prisma.CityFindManyArgs;
};
