import { Language, Prisma } from '@prisma/client';
import { OrderStatusCountFilterDTO } from '../dto/order.countStatus.filter.dto';

export const getOrderStatusCountFilterArgs = (
  query: OrderStatusCountFilterDTO,
  languages: Language[],
) => {
  const trimmedValue = query?.serviceOrClientName?.trim();

  return {
    where: {
      AND: [
        {
          branchId: query?.branchId,
        },
        ...(trimmedValue
          ? [
              {
                OrderItems: {
                  some: {
                    Service: {
                      OR: [
                        {
                          name: {
                            path: '$.ar',
                            string_contains: query?.serviceOrClientName,
                          },
                        },
                        {
                          name: {
                            path: '$.en',
                            string_contains: query?.serviceOrClientName,
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ]
          : []),
        {
          Customer: {
            name: query.serviceOrClientName,
          },
        },
        {
          date: {
            gte: query.fromDate,
            lte: query.toDate,
          },
        },
      ],
    },
  };
};

export const getOrderStatusCountFilterArgsWithSelect = () => {
  return {} satisfies Prisma.OrderFindManyArgs;
};
