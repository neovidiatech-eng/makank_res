import { Prisma, User } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { selectUserOBJ } from 'src/_modules/user/prisma-args/user.prisma-select';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  containsInFields,
  filterKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterCustomerDTO } from '../dto/filter.customer.dto';

function parseFlexibleDate(str: any, isEndDate = false): Date | null {
  if (!str) return null;
  const s = String(str).trim();
  if (!s) return null;

  let d: Date | null = null;

  // Check DD/MM/YYYY or DD-MM-YYYY format
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2 = parseInt(parts[2], 10);

    if (p2 > 1000 && p1 >= 1 && p1 <= 12 && p0 >= 1 && p0 <= 31) {
      // Format is DD/MM/YYYY: p0=day, p1=month, p2=year
      d = new Date(p2, p1 - 1, p0);
    } else if (p0 > 1000 && p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
      // Format is YYYY/MM/DD: p0=year, p1=month, p2=day
      d = new Date(p0, p1 - 1, p2);
    }
  }

  if (!d || isNaN(d.getTime())) {
    d = new Date(s);
  }

  if (!d || isNaN(d.getTime())) return null;

  if (isEndDate) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

export function resolveDateRangeFilter(query: any): { gte?: Date; lte?: Date } | null {
  if (!query) return null;

  const rawFrom = query.fromDate || query.from || query.startDate || query.createdFrom;
  const rawTo = query.toDate || query.to || query.endDate || query.createdTo;
  const rawDate = query.date;
  const rawPeriod = query.periodFilter || query.period;

  if (rawFrom || rawTo) {
    const range: { gte?: Date; lte?: Date } = {};
    if (rawFrom) {
      const d = parseFlexibleDate(rawFrom, false);
      if (d) range.gte = d;
    }
    if (rawTo) {
      const d = parseFlexibleDate(rawTo, true);
      if (d) range.lte = d;
    }
    return Object.keys(range).length > 0 ? range : null;
  }

  if (rawDate) {
    const start = parseFlexibleDate(rawDate, false);
    const end = parseFlexibleDate(rawDate, true);
    if (start && end) {
      return { gte: start, lte: end };
    }
  }

  if (rawPeriod) {
    const now = new Date();
    const period = String(rawPeriod).toUpperCase();
    if (period === 'TODAY') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { gte: start, lte: end };
    } else if (period === 'THIS_WEEK' || period === 'LAST_7_DAYS' || period === '7_DAYS') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { gte: start, lte: end };
    } else if (period === 'THIS_MONTH' || period === 'LAST_30_DAYS' || period === '30_DAYS') {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
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
