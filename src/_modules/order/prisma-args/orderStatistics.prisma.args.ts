import { Prisma } from '@prisma/client';
import { FilterStoreWalletDTO } from '../dto/order.countStatus.filter.dto';

export const getOrderStatisticsArgs = (query: FilterStoreWalletDTO) => {
  const where = [];
  if (query.branchId) {
    where.push({
      branchId: query?.branchId,
    });
  }
  if (query.specialistId) {
    where.push({
      specialistId: query?.specialistId,
    });
  }
  return {
    where: {
      AND: [...where],
    },
  };
};

export const getOrderStatisticsArgsWithSelect = () => {
  return {} satisfies Prisma.OrderFindManyArgs;
};
