import { Fund, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterFundDTO } from '../dto/fund.dto';

export const selectFundOBJ = () => {
  const selectArgs: Prisma.FundSelect = {
    id: true,
    price: true,
    Customer: {
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        image: true,
      },
    },
    createdAt: true,
    deletedAt: true,
  };
  return selectArgs;
};

export const getFundArgs = (query: FilterFundDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<Fund>(filter, 'customerId'),
    filterKey<Fund>(filter, 'id'),
  ]
    .filter((x) => x)
    .flat();

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    select: selectFundOBJ(),
    where: {
      AND: searchArray,
    },
  } satisfies Prisma.FundFindManyArgs;
};
