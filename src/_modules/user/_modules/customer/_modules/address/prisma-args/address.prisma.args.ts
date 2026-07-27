import { Address, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  containsInFields,
  filterKey,
  orderKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterAddressDTO } from '../dto/address.dto';

export const getAddressArgs = (query: FilterAddressDTO) => {
  const { orderBy, page, limit, ...filter } = query;
  const searchArray = [
    filterKey<Address>(filter, 'id'),
    filterKey<Address>(filter, 'lat'),
    filterKey<Address>(filter, 'lng'),
    filterKey<Address>(filter, 'default'),
    filterKey<Address>(filter, 'userId'),
    containsInFields<Address>(['title'], filter?.title),
  ].filter(Boolean) as Prisma.AddressWhereInput[];

  const orderArray = [
    orderKey('id', 'id', orderBy),
    orderKey('title', 'title', orderBy),
    orderKey('lat', 'lat', orderBy),
    orderKey('lng', 'lng', orderBy),
    orderKey('default', 'default', orderBy),
  ].filter(Boolean) as Prisma.AddressOrderByWithRelationInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray,
    where: {
      AND: searchArray,
    },
  } as Prisma.AddressFindManyArgs;
};

export const selectAddressOBJ = () => {
  const selectArgs: Prisma.AddressSelect = {
    id: true,
    title: true,
    adress: true,
    lat: true,
    lng: true,
    default: true,
    createdAt: true,
  };
  return selectArgs;
};
export const getAddressArgsWithSelect = () => {
  return {
    select: selectAddressOBJ(),
  } satisfies Prisma.AddressFindManyArgs;
};
