import { KeyValue, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterKeyValueDTO } from '../dto/filter.dto';

export const getKeyValueArgs = (query: FilterKeyValueDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<KeyValue>(filter, 'id'),
    filterKey<KeyValue>(filter, 'key'),
  ].filter(Boolean) as Prisma.KeyValueWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    where: {
      AND: [...searchArray],
    },
  } as Prisma.KeyValueFindManyArgs;
};

export const selectKeyValueOBJ = () => {
  const selectArgs: Prisma.KeyValueSelect = {
    id: true,
    key: true,
    value: true,
    createdAt: true,
  };

  return selectArgs;
};
export const getKeyValueArgsWithSelect = () => {
  return {
    select: selectKeyValueOBJ(),
  } satisfies Prisma.KeyValueFindManyArgs;
};
