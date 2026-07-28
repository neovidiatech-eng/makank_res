import { Prisma, User } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterEmployeeDTO } from '../dto/employee.dto';

export const getEmployeeArgs = (
  query: FilterEmployeeDTO,
  isCustomer = false,
) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<User>(filter, 'id'),
    filterKey(filter, 'name'),
    filterKey<User>(filter, 'storeId'),
    filterKey<User>(filter, 'active'),
  ].filter(Boolean) as Prisma.UserWhereInput[];

  const orderArray = [
    isCustomer && {
      randomSeed: 'desc',
    },
  ].filter(Boolean) as Prisma.UserOrderByWithRelationInput[];
  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray,
    where: {
      AND: [{ roleKey: RolesKeys.STORE }, ...searchArray],
    },
  } as Prisma.UserFindManyArgs;
};

export const selectEmployeeOBJ = () => {
  // email/phone/branchId/Role were previously missing entirely — a management
  // screen can't tell employees apart or show what they can do without them.
  const selectArgs: Prisma.UserSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    image: true,
    active: true,
    branchId: true,
    createdAt: true,
    Role: {
      select: {
        id: true,
        name: true,
      },
    },
  };
  return selectArgs;
};
export const getEmployeeArgsWithSelect = () => {
  return {
    select: selectEmployeeOBJ(),
  } satisfies Prisma.UserFindManyArgs;
};
