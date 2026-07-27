import { Language, Prisma, Service, ServiceStatus } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  filterJsonKeyWithRawSQL,
  filterKey,
  orderKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterServiceDTO } from '../dto/service.dto';

export const getServiceArgs = (
  query: FilterServiceDTO,
  languages: Language[],
  isCustomerPath?: boolean,
) => {
  const { orderBy, page, limit, price, ...filter } = query;
  const searchArray = [
    filterKey<Service>(filter, 'id'),
    filterKey<Service>(filter, 'rating'),
    filterKey<Service>(filter, 'categoryId'),
    filterJsonKeyWithRawSQL<Service>(filter, 'name', languages),
    filterJsonKeyWithRawSQL<Service>(filter, 'description', languages),
    (filter.customerId || isCustomerPath) && {
      status: ServiceStatus.ACTIVE,
      available: true,
    },
    filterKey<Service>(filter, 'storeId'),
    {
      Category: {
        deletedAt: null,
      },
    },

    filter.categoryId && {
      Category: {
        id: filter.categoryId,
        deletedAt: null,
      },
    },
    filterKey<Service>(filter, 'bestRated'),
    filterKey<Service>(filter, 'mostSeller'),
    filterKey<Service>(filter, 'status'),
    filterKey<Service>(filter, 'available'),

    filter?.favouriteCustomerId && {
      Favorites: {
        some: {
          customerId: filter?.favouriteCustomerId,
        },
      },
      // Fav: {
      //   some: {
      //     customerId: filter?.favouriteCustomerId,
      //   },
      // },
    },
  ].filter(Boolean) as Prisma.ServiceWhereInput[];

  const orderArray = [
    orderKey('id', 'id', orderBy),
    orderKey('rating', 'rating', orderBy),
    orderKey('price', 'price', orderBy),
  ].filter(Boolean) as Prisma.ServiceOrderByWithRelationInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray,
    where: {
      AND: searchArray,
    },
  } as Prisma.ServiceFindManyArgs;
};

export const selectServiceOBJ = () => {
  const selectArgs: Prisma.ServiceSelect = {
    id: true,
    name: true,
    description: true,
    image: true,
    durationMinutes: true,
    price: true,
    priceAfterDiscount: true,

    status: true,
    available: true,
    totalOrders: true,
    totalAmountSold: true,
    rating: true,
    review: true,
    bestRated: true,
    mostSeller: true,
    createdAt: true,
    Category: {
      select: {
        id: true,
        name: true,
      },
    },
    Store: {
      select: {
        id: true,
        name: true,
        cover: true,
        logo: true,
        commission: true,
        commissionType: true,

        branches: {
          select: {
            id: true,
            address: true,
            rating: true,
            review: true,
            lat: true,
            lng: true,
          },
          take: 1,
        },
      },
    },
    // Sizes are needed even in list views: priceWithDefaultOptions / hasDiscount are
    // derived from the default SIZE (what checkout charges), not the base service
    // price. Without this, a base-level discount would be advertised in listings while
    // checkout charges the full size price ("see 120, pay 150").
    Sizes: {
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        price: true,
        priceAfterDiscount: true,
        isDefault: true,
      },
    },
  };
  return selectArgs;
};
export const selectServiceOBJById = () => {
  const selectArgs: Prisma.ServiceSelect = {
    ...selectServiceOBJ(),
    Sizes: {
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        price: true,
        priceAfterDiscount: true,
        isDefault: true,
      },
    },
    Addons: {
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        price: true,
      },
    },
  };
  return selectArgs;
};
export const selectServiceOBJWithFavourite = (customerId: Id, id?: Id) => {
  const selectArgs: Prisma.ServiceSelect = {
    ...(!id ? selectServiceOBJ() : selectServiceOBJById()),
    Favorites: {
      where: {
        customerId,
      },
    },
  } satisfies Prisma.ServiceSelect & { isFavourite?: { id: Id }[] };
  return selectArgs;
};

export const getServiceArgsWithSelect = (customerId?: Id, id?: Id) => {
  let obj = id ? selectServiceOBJById() : selectServiceOBJ();
  if (customerId) {
    obj = selectServiceOBJWithFavourite(customerId, id);
  }

  return {
    select: obj,
  } satisfies Prisma.ServiceFindManyArgs;
};
