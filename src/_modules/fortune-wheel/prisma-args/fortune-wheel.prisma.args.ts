import { FortuneWheelItem, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  filterKey,
  orderKey,
  search,
} from 'src/globals/helpers/prisma-filters';
import { FilterFortuneWheelItemDTO } from '../dto/fortune-wheel.dto';

export const getFortuneWheelItemArgs = (query: FilterFortuneWheelItemDTO) => {
  const { page, limit, orderBy, ...filter } = query;

  const searchArray = [
    filterKey<FortuneWheelItem>(filter, 'id'),
    ...(search<FortuneWheelItem>(filter, 'displayName') ?? []),
    filterKey<FortuneWheelItem>(filter, 'rewardType'),
    filterKey<FortuneWheelItem>(filter, 'isActive'),
  ].filter(Boolean) as Prisma.FortuneWheelItemWhereInput[];

  const orderArray = [
    orderKey('sortOrder', 'sortOrder', orderBy),
    orderKey('id', 'id', orderBy),
    orderKey('displayName', 'displayName', orderBy),
    orderKey('createdAt', 'createdAt', orderBy),
  ].filter(Boolean) as Prisma.FortuneWheelItemOrderByWithRelationInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray.length
      ? orderArray
      : [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    where: {
      AND: searchArray,
    },
  } as Prisma.FortuneWheelItemFindManyArgs;
};

export const selectFortuneWheelItemOBJ = () => {
  const selectArgs: Prisma.FortuneWheelItemSelect = {
    id: true,
    displayName: true,
    rewardType: true,
    rewardValue: true,
    weight: true,
    maxDiscount: true,
    minOrderAmount: true,
    maxOrderAmount: true,
    rewardExpiryHours: true,
    isActive: true,
    sortOrder: true,
    createdAt: true,
    updatedAt: true,
  };
  return selectArgs;
};

export const getFortuneWheelItemArgsWithSelect = () => {
  return {
    select: selectFortuneWheelItemOBJ(),
  } satisfies Prisma.FortuneWheelItemFindManyArgs;
};

export const selectFortuneWheelUserRewardOBJ = () => {
  const selectArgs: Prisma.FortuneWheelUserRewardSelect = {
    id: true,
    itemId: true,
    rewardType: true,
    rewardValue: true,
    maxDiscount: true,
    minOrderAmount: true,
    maxOrderAmount: true,
    status: true,
    expiresAt: true,
    redeemedAt: true,
    redeemedOrderId: true,
    createdAt: true,
  };
  return selectArgs;
};
