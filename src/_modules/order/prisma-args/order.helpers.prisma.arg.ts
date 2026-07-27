import { Prisma } from '@prisma/client';

export const selectOrderByIdForValidationOBJ = () => {
  const selectArgs: Prisma.OrderSelect = {
    id: true,
    status: true,
    type: true,
    paymentStatus: true,
    deliveryId: true,
    addressId: true,
    branchId: true,
    totalPriceAfterDiscount: true,
    adminCommission: true,
    globalCommission: true,
    storeCommission: true,
    shipping: true,
    tax: true,
    assignmentReadyAt: true,
    paymentMethod: true,
    paidWithWallet: true,
    userId: true,
    Customer: { select: { id: true } },
    OrderItems: {
      select: {
        serviceId: true,
        Service: {
          select: {
            storeId: true,
          },
        },
      },
    },
  };
  return selectArgs;
};

export type selectOrderByIdForValidationOBJType = Prisma.OrderGetPayload<{
  select: ReturnType<typeof selectOrderByIdForValidationOBJ>;
}>;
