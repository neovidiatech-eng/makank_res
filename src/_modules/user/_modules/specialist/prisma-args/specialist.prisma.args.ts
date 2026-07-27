import { Prisma, Specialist } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  containsInFields,
  filterKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterSpecialistDTO } from '../dto/specialist.dto';

export const getArgs = (query: FilterSpecialistDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<Specialist>(filter, 'storeId'),
    containsInFields<Specialist>(['name'], filter?.name?.at(0)),
  ].filter(Boolean) as Prisma.SpecialistWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    where: {
      AND: searchArray,
    },
  } satisfies Prisma.SpecialistFindManyArgs;
};
