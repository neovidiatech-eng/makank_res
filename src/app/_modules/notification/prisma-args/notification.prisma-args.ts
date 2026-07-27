import { Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterNotificationDTO } from '../dto/notification.dto';

export const getNotificationArgs = (query: FilterNotificationDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [filterKey(filter, 'userId')].filter(
    Boolean,
  ) as Prisma.NotificationWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, false),
    where: {
      AND: searchArray,
    },
    select: {
      id: true,
      title: true,
      image: true,
      body: true,
      read: true,
      createdAt: true,
      userId: true,
      groupKey: true,
      type: true,
      resourceId: true,
      clickTargetType: true,
      clickStoreId: true,
      clickCategoryId: true,
      clickServiceId: true,
      clickZoneId: true,
      clickOrderId: true,
      clickCouponId: true,
      clickUrl: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  } as Prisma.NotificationFindManyArgs;
};
