import { Prisma, StoreTemplate, TemplateCategory } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey, orderKey } from 'src/globals/helpers/prisma-filters';
import {
  FilterStoreTemplateDTO,
  FilterTemplateCategoryDTO,
} from '../dto/store-template.dto';

export const getStoreTemplateArgs = (query: FilterStoreTemplateDTO) => {
  const { orderBy, page, limit, isCustomStoreCategory: _ignored, ...filter } = query;

  // isCustomStoreCategory is a DTO-level flag — not a column on StoreTemplate.
  // It is handled directly in listTemplateCategories() in the service, which
  // decides at runtime whether to query TemplateCategory or Category rows.
  // No WHERE condition on StoreTemplate is needed here.

  const searchArray = [
    filterKey<StoreTemplate>(filter, 'id'),
    filterKey<StoreTemplate>(filter, 'active'),
    filterKey<StoreTemplate>(filter, 'moduleType'),
  ].filter(Boolean) as Prisma.StoreTemplateWhereInput[];

  const orderArray = [
    orderKey('order', 'order', orderBy),
    orderKey('id', 'id', orderBy),
  ].filter(Boolean) as Prisma.StoreTemplateOrderByWithRelationInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray,
    where: { AND: searchArray },
  } as Prisma.StoreTemplateFindManyArgs;
};

export const selectStoreTemplateOBJ = (): Prisma.StoreTemplateSelect => ({
  id: true,
  name: true,
  description: true,
  image: true,
  moduleType: true,
  active: true,
  order: true,
  createdAt: true,
});

export const selectStoreTemplateFullOBJ = (): Prisma.StoreTemplateSelect => ({
  ...selectStoreTemplateOBJ(),
  categories: {
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      image: true,
      order: true,
      services: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          description: true,
          image: true,
          durationMinutes: true,
          price: true,
          priceAfterDiscount: true,
          available: true,
          bestRated: true,
          mostSeller: true,
          sizes: {
            select: {
              id: true,
              name: true,
              price: true,
              priceAfterDiscount: true,
              isDefault: true,
            },
          },
          addons: {
            select: {
              id: true,
              name: true,
              price: true,
            },
          },
        },
      },
    },
  },
});

export const getTemplateCategoryArgs = (query: FilterTemplateCategoryDTO) => {
  const { page, limit, ...filter } = query ?? ({} as FilterTemplateCategoryDTO);

  const searchArray = [
    filterKey<TemplateCategory>(filter, 'id'),
    filterKey<TemplateCategory>(filter, 'templateId'),
  ].filter(Boolean) as Prisma.TemplateCategoryWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: [
      { order: 'asc' },
      { id: 'asc' },
    ] as Prisma.TemplateCategoryOrderByWithRelationInput[],
    where: { AND: searchArray },
  } as Prisma.TemplateCategoryFindManyArgs;
};

export const selectTemplateCategoryOBJ = (): Prisma.TemplateCategorySelect => ({
  id: true,
  name: true,
  image: true,
  order: true,
  templateId: true,
  services: {
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      image: true,
      durationMinutes: true,
      price: true,
      priceAfterDiscount: true,
      available: true,
      bestRated: true,
      mostSeller: true,
      sizes: {
        select: {
          id: true,
          name: true,
          price: true,
          priceAfterDiscount: true,
          isDefault: true,
        },
      },
      addons: {
        select: {
          id: true,
          name: true,
          price: true,
        },
      },
    },
  },
});
