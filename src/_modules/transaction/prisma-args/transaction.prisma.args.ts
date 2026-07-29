import { Prisma, Transaction } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterTransactionDTO } from '../dto/transaction.dto';
// import { FilterFundDTO } from '../dto/fund.dto';

export const getTransactionArgs = (query: FilterTransactionDTO) => {
  const { page, limit, ...filter } = query;

  const searchArray = [
    filterKey<Transaction>(filter, 'branchId'),
    filterKey<Transaction>(filter, 'customerId'),
    filterKey<Transaction>(filter, 'storeId'),

    filter.transactionDateFrom
      ? {
          createdAt: {
            gte: filter.transactionDateFrom,
          },
        }
      : undefined,
    filter.transactionDateTo
      ? {
          createdAt: {
            lte: filter.transactionDateTo,
          },
        }
      : undefined,
  ]

    .filter((x) => x)
    .flat();

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    where: {
      AND: searchArray,
    },
  } satisfies Prisma.TransactionFindManyArgs;
};

export const transactionSelectArgs = () => {
  const selectArgs: Prisma.TransactionSelect = {
    id: true,
    credit: true,
    debit: true,
    balance: true,
    createdAt: true,
    type: true,
    userType: true,
    referenceId: true,
    branchId: true,
    customerId: true,
    Branch: {
      select: {
        id: true,
        name: true,
        Store: {
          select: {
            cover: true,
            logo: true,
          },
        },
      },
    },
    Customer: {
      select: {
        name: true,
        image: true,
      },
    },
  };
  return selectArgs;
};

export const selectFundOBJ = () => {
  const selectArgs: Prisma.FundSelect = {
    id: true,
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

// export const getFundArgs = (query: FilterFundDTO) => {
//   const { page, limit, ...filter } = query;
//   const searchArray = [
//     filterKey<Fund>(filter, 'customerId'),
//     filterKey<Fund>(filter, 'id'),
//     ]
//     .filter((x) => x)
//     .flat();

//   return {
//     ...paginateOrNot({ limit, page }, query?.id),
//     select: selectFundOBJ(),
//     where: {
//       AND: searchArray,
//     },
//   } satisfies Prisma.FundFindManyArgs;
// };
