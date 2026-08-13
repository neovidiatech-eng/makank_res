import { Prisma, User } from '@prisma/client';
import { resolveDateRangeFilter } from 'src/_modules/user/_modules/customer/prisma-args/customer.prisma-args';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  containsInFields,
  filterKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterUserDTO, UserOrderFilterEnum } from '../dto/filter.user.dto';
import { selectUserOBJ } from './user.prisma-select';

export const getUserArgs = (query: FilterUserDTO) => {
  const { page, limit, ...filter } = query;
  const dateRange = resolveDateRangeFilter(query as any);
  const searchTerm = (
    query.search ||
    query.q ||
    query.name ||
    query.phone ||
    query.email ||
    ''
  ).trim();

  let normalizedRoleKey = filter?.roleKey ? String(filter.roleKey).toUpperCase() : undefined;
  if (normalizedRoleKey === 'CUSTOMER') normalizedRoleKey = 'CUSTOMER';
  else if (normalizedRoleKey === 'STORE') normalizedRoleKey = 'STORE';
  else if (normalizedRoleKey === 'DELIVERY') normalizedRoleKey = 'DELIVERY';
  else if (normalizedRoleKey === 'ADMIN') normalizedRoleKey = 'ADMIN';

  const searchArray: Prisma.UserWhereInput[] = [];

  if (normalizedRoleKey) {
    searchArray.push({ roleKey: normalizedRoleKey as any });
  } else if (filterKey<User>(filter, 'roleKey')) {
    searchArray.push(filterKey<User>(filter, 'roleKey') as any);
  }

  if (searchTerm) {
    const numericId = Number(searchTerm);
    const isValidId = Number.isInteger(numericId) && numericId > 0;
    searchArray.push({
      OR: [
        { name: { contains: searchTerm } },
        { email: { contains: searchTerm } },
        { phone: { contains: searchTerm } },
        ...(isValidId ? [{ id: numericId }] : []),
      ],
    });
  }

  if (filterKey<User>(filter, 'id') && !searchTerm) {
    searchArray.push(filterKey<User>(filter, 'id') as any);
  }
  if (filterKey<User>(filter, 'roleId')) {
    searchArray.push(filterKey<User>(filter, 'roleId') as any);
  }

  if (filter?.zeroOrdersOnly || filter?.orderFilter === UserOrderFilterEnum.ZERO_ORDERS) {
    searchArray.push({ CustomerOrders: { none: {} } });
  }

  if (dateRange) {
    searchArray.push({
      OR: [
        { createdAt: dateRange },
        { CustomerOrders: { some: { date: dateRange } } },
      ],
    });
  }

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

