import { Prisma, User } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  containsInFields,
  filterKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterUserDTO, UserOrderFilterEnum } from '../dto/filter.user.dto';
import { selectUserOBJ } from './user.prisma-select';

export const getUserArgs = (query: FilterUserDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    containsInFields(['name'], filter?.name),
    containsInFields(['email'], filter?.email),
    containsInFields(['phone'], filter?.phone),
    filterKey<User>(filter, 'id'),
    filterKey<User>(filter, 'roleId'),
    filterKey<User>(filter, 'roleKey'),
    (filter?.zeroOrdersOnly || filter?.orderFilter === UserOrderFilterEnum.ZERO_ORDERS) && {
      CustomerOrders: { none: {} },
    },
  ]
    .filter((x) => x)
    .flat() as Prisma.UserWhereInput[];

  let orderBy: Prisma.UserOrderByWithRelationInput[] | undefined;
  if (filter?.orderFilter === UserOrderFilterEnum.MOST_ORDERS) {
    orderBy = [{ CustomerOrders: { _count: 'desc' } }, { id: 'desc' }];
  } else if (filter?.orderFilter === UserOrderFilterEnum.LEAST_ORDERS) {
    orderBy = [{ CustomerOrders: { _count: 'asc' } }, { id: 'asc' }];
  }

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    ...(orderBy ? { orderBy } : {}),
    select: selectUserOBJ(),
    where: {
      AND: searchArray,
    },
  } satisfies Prisma.UserFindManyArgs;
};

