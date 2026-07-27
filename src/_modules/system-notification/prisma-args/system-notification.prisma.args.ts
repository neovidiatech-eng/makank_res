import { Prisma, SystemNotification } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterSystemNotificationDTO } from '../dto/system-notification.dto';

export const getSystemNotificationArgs = (
  query: FilterSystemNotificationDTO,
) => {
  const { page, limit, ...filter } = query;
  const searchArray = [filterKey<SystemNotification>(filter, 'id')].filter(
    Boolean,
  ) as Prisma.SystemNotificationWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    where: {
      AND: searchArray,
    },
  } as Prisma.SystemNotificationFindManyArgs;
};

export const selectSystemNotificationOBJ = () => {
  const selectArgs: Prisma.SystemNotificationSelect = {
    id: true,

    title: true,
    body: true,
    email: true,
    sms: true,
    notification: true,

    createdAt: true,
  };
  return selectArgs;
};
export const getSystemNotificationArgsWithSelect = () => {
  return {
    select: selectSystemNotificationOBJ(),
  } satisfies Prisma.SystemNotificationFindManyArgs;
};
