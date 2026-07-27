import { Prisma, User } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  containsInFields,
  filterKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterUserDTO } from '../dto/filter.user.dto';
import { selectUserOBJ } from './user.prisma-select';

export const getUserArgs = (query: FilterUserDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    containsInFields(['name'], filter?.name),
    containsInFields(['email'], filter?.email),
    containsInFields(['phone'], filter?.phone),
    filterKey<User>(filter, 'id'),
  ]
    .filter((x) => x)
    .flat();

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    select: selectUserOBJ(),
    where: {
      AND: searchArray,
    },
  } satisfies Prisma.UserFindManyArgs;
};
