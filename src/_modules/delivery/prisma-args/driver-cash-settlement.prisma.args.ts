import { DriverCashSettlement, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterCashSettlementDTO } from '../dto/driver-cash-settlement.dto';

export const getCashSettlementArgs = (query: FilterCashSettlementDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<DriverCashSettlement>(filter, 'id'),
    filterKey<DriverCashSettlement>(filter, 'deliveryId'),
  ].filter(Boolean) as Prisma.DriverCashSettlementWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    where: {
      AND: searchArray,
    },
    orderBy: { createdAt: 'desc' },
  } as Prisma.DriverCashSettlementFindManyArgs;
};

export const selectCashSettlementArgs = () => {
  const selectArgs: Prisma.DriverCashSettlementSelect = {
    id: true,
    deliveryId: true,
    amount: true,
    note: true,
    createdAt: true,
    Delivery: {
      select: {
        User: { select: { id: true, name: true, phone: true, image: true } },
      },
    },
  };
  return selectArgs;
};

export const getCashSettlementArgsWithSelect = () => {
  return {
    select: selectCashSettlementArgs(),
  } satisfies Prisma.DriverCashSettlementFindManyArgs;
};
