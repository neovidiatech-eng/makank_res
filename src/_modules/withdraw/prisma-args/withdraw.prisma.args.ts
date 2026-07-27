import { Prisma, Withdraw } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterWithdrawDTO } from '../dto/withdraw.dto';

export const getWithdrawArgs = (query: FilterWithdrawDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<Withdraw>(filter, 'id'),
    filterKey<Withdraw>(filter, 'status'),
    filterKey<Withdraw>(filter, 'branchId'),
    filter.storeId && {
      Branch: {
        storeId: filter.storeId,
      },
    },
  ].filter(Boolean) as Prisma.WithdrawWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    where: {
      AND: searchArray,
    },
  } as Prisma.WithdrawFindManyArgs;
};

export const selectWithdrawArgs = () => {
  const selectArgs: Prisma.WithdrawSelect = {
    id: true,
    branchId: true,
    amount: true,
    payoutMethod: true,
    payoutDetails: true,
    createdAt: true,
    status: true,
    Branch: true,
  };
  return selectArgs;
};
export const getWithdrawArgsWithSelect = () => {
  return {
    select: selectWithdrawArgs(),
  } satisfies Prisma.WithdrawFindManyArgs;
};
