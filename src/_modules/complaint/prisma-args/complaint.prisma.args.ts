import { Prisma } from '@prisma/client';
import { FilterComplaintDTO } from '../dto/complaint.dto';

export const selectComplaintOBJ = () => {
  const select: Prisma.ComplaintSelect = {
    id: true,
    userId: true,
    orderId: true,
    reason: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    User: {
      select: {
        id: true,
        name: true,
        phone: true,
      },
    },
    Order: {
      select: {
        id: true,
        status: true,
        totalPriceAfterDiscount: true,
      },
    },
    Replies: {
      select: {
        id: true,
        message: true,
        createdAt: true,
        User: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' as Prisma.SortOrder },
    },
  };
  return select;
};

export const getComplaintArgs = (filters: FilterComplaintDTO) => {
  const where: Prisma.ComplaintWhereInput = {
    id: filters.id,
    orderId: filters.orderId,
    userId: filters.userId,
    status: filters.status,
    deletedAt: null,
  };

  return {
    where,
    take: filters.limit || 10,
    skip: ((filters.page || 1) - 1) * (filters.limit || 10),
    orderBy: { createdAt: 'desc' as Prisma.SortOrder },
  };
};
