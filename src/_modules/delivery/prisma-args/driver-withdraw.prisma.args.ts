import { DriverWithdraw, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterDriverWithdrawDTO } from '../dto/driver-withdraw.dto';

export const getDriverWithdrawArgs = (query: FilterDriverWithdrawDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<DriverWithdraw>(filter, 'id'),
    filterKey<DriverWithdraw>(filter, 'deliveryId'),
    filterKey<DriverWithdraw>(filter, 'status'),
  ].filter(Boolean) as Prisma.DriverWithdrawWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    where: {
      AND: searchArray,
    },
    orderBy: { createdAt: 'desc' },
  } as Prisma.DriverWithdrawFindManyArgs;
};

export const selectDriverWithdrawArgs = () => {
  const selectArgs: Prisma.DriverWithdrawSelect = {
    id: true,
    deliveryId: true,
    amount: true,
    payoutMethod: true,
    payoutDetails: true,
    status: true,
    adminNote: true,
    createdAt: true,
    respondedAt: true,
    Delivery: {
      select: {
        User: { select: { id: true, name: true, phone: true, image: true } },
      },
    },
  };
  return selectArgs;
};

export const getDriverWithdrawArgsWithSelect = () => {
  return {
    select: selectDriverWithdrawArgs(),
  } satisfies Prisma.DriverWithdrawFindManyArgs;
};
