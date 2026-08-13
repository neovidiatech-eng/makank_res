import { Prisma, User } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { selectUserOBJ } from 'src/_modules/user/prisma-args/user.prisma-select';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  containsInFields,
  filterKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterCustomerDTO } from '../dto/filter.customer.dto';

export function resolveDateRangeFilter(query: {
  fromDate?: string;
  toDate?: string;
  date?: string;
  periodFilter?: string;
}): { gte?: Date; lte?: Date } | null {
  if (query.fromDate || query.toDate) {
    const range: any = {};
    if (query.fromDate) {
      const d = new Date(query.fromDate);
      if (!isNaN(d.getTime())) range.gte = d;
    }
    if (query.toDate) {
      const d = new Date(query.toDate);
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        range.lte = d;
      }
    }
    return Object.keys(range).length > 0 ? range : null;
  }

  if (query.date) {
    const base = new Date(query.date);
    if (!isNaN(base.getTime())) {
      const start = new Date(base);
      start.setHours(0, 0, 0, 0);
      const end = new Date(base);
      end.setHours(23, 59, 59, 999);
      return { gte: start, lte: end };
    }
  }

  if (query.periodFilter) {
    const now = new Date();
    const period = String(query.periodFilter).toUpperCase();
    if (period === 'TODAY') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { gte: start, lte: end };
    } else if (period === 'THIS_WEEK') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { gte: start, lte: end };
    } else if (period === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { gte: start, lte: end };
    }
  }

  return null;
}

export const getCustomerArgs = (query: FilterCustomerDTO) => {
  const { page, limit, ...filter } = query;
  const searchTerm = (
    query.search ||
    query.q ||
    query.name ||
    query.phone ||
    query.email ||
    ''
  ).trim();

  const dateRange = resolveDateRangeFilter(query);

  const andConditions: any[] = [{ roleKey: RolesKeys.CUSTOMER }];

  if (searchTerm) {
    const numericId = Number(searchTerm);
    const isValidId = Number.isInteger(numericId) && numericId > 0;

    andConditions.push({
      OR: [
        { name: { contains: searchTerm } },
        { email: { contains: searchTerm } },
        { phone: { contains: searchTerm } },
        ...(isValidId ? [{ id: numericId }] : []),
      ],
    });
  }

  if (filterKey<User>(filter, 'active')) {
    andConditions.push(filterKey<User>(filter, 'active'));
  }
  if (filterKey<User>(filter, 'verified')) {
    andConditions.push(filterKey<User>(filter, 'verified'));
  }
  if (filter.id && !searchTerm) {
    andConditions.push({ id: Number(filter.id) });
  }

  if (dateRange) {
    andConditions.push({
      OR: [
        { createdAt: dateRange },
        { Order: { some: { date: dateRange } } },
      ],
    });
  }

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    select: { ...selectUserOBJ() },
    where: {
      AND: andConditions,
    },
  } satisfies Prisma.UserFindManyArgs;
};
