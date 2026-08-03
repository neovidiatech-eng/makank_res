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
    filterKey<City>(filter, 'active'),
    filterJsonKeyWithRawSQL<City>(filter, 'name', languages),
  ].filter(Boolean) as Prisma.CityWhereInput[];
  return {
    ...paginateOrNot({ limit, page }, query?.id),
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
    active: true,
  };
  return selectArgs;
};
export const getCityArgsWithSelect = () => {
  return {
    select: selectCityOBJ(),
  } satisfies Prisma.CityFindManyArgs;
};
