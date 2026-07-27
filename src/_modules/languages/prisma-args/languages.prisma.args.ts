import { Language, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey, orderKey } from 'src/globals/helpers/prisma-filters';
import { FilterLanguagesDTO } from '../dto/languages.dto';

export const getLanguagesArgs = (query: FilterLanguagesDTO) => {
  const { orderBy, page, limit, ...filter } = query;
  const searchArray = [
    filterKey<Language>(filter, 'name'),
    filterKey<Language>(filter, 'key'),
  ].filter(Boolean) as Prisma.LanguageWhereInput[];

  const orderArray = [
    orderKey('id', 'id', orderBy),
    orderKey('name', 'name', orderBy),
    orderKey('key', 'key', orderBy),
  ].filter(Boolean) as Prisma.LanguageOrderByWithRelationInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.key),
    orderBy: orderArray,
    where: {
      AND: searchArray,
    },
  } as Prisma.LanguageFindManyArgs;
};

export const selectLanguagesOBJ = () => {
  const selectArgs: Prisma.LanguageSelect = {
    name: true,
    key: true,
    file: true,
    frontFile: true,
    createdAt: true,
  };
  return selectArgs;
};
export const getLanguagesArgsWithSelect = () => {
  return {
    select: selectLanguagesOBJ(),
  } satisfies Prisma.LanguageFindManyArgs;
};
