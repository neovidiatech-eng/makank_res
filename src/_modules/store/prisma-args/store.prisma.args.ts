import { Language, Prisma, Store } from '@prisma/client';
import {
  selectBundleOBJ,
  validBundleWhere,
} from 'src/_modules/bundle/prisma-args/bundle.prisma.args';
import { selectServiceOBJ } from 'src/_modules/serviceModule/prisma-args/service.prisma.args';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  filterJsonKeyWithRawSQL,
  filterKey,
  orderKey,
} from 'src/globals/helpers/prisma-filters';
import { FilterStoreDTO } from '../dto/store.dto';

export const getStoreArgs = (
  query: FilterStoreDTO,
  languages: Language[],
  stores: Store[],
  filterWithStore?: boolean,
  enforceVisible?: boolean,
) => {
  const { orderBy, page, limit, ...filter } = query;
  const searchArray = [
    filterKey<Store>(filter, 'id'),
    filterJsonKeyWithRawSQL<Store>(filter, 'name', languages),
    filterKey<Store>(filter, 'planId'),
    filterKey<Store>(filter, 'cityId'),
    filterKey<Store>(filter, 'isStoreAccepted'),
    filterKey<Store>(filter, 'isVerified'),
    filterKey<Store>(filter, 'isBlocked'),

    filter.active !== undefined && {
      branches: {
        some: { isActive: filter.active },
      },
    },
    filter.closed !== undefined && {
      branches: {
        some: { closed: filter.closed },
      },
    },
    filterKey<Store>(filter, 'freeDelivery'),
    filter.minRating && {
      branches: {
        some: {
          rating: {
            gte: filter?.minRating,
          },
        },
      },
    },

    filter.hasOffers && {
      StoreCoupons: {
        some: {
          Coupon: {
            expired: false,
            active: true,
          },
        },
      },
    },
    filter.price && {
      Services: {
        some: {
          priceAfterDiscount: {
            gte:
              filter?.price[0]?.min !== undefined
                ? +filter?.price[0]?.min
                : undefined,
            lte:
              filter?.price[0]?.max !== undefined
                ? +filter?.price[0]?.max
                : undefined,
          },
        },
      },
    },
    filterWithStore && {
      id: {
        in: stores.map((store) => store.id),
      },
    },
    filter?.favouriteCustomerId && {
      branches: {
        some: {
          favorites: {
            some: {
              customerId: filter?.favouriteCustomerId,
            },
          },
        },
      },
    },
    filter?.templateCategoryId && {
      SubCategories: {
        some: {
          templateCategoryId: filter.templateCategoryId,
          deletedAt: null,
        },
      },
    },
    filter?.categoryId && {
      SubCategories: {
        some: {
          id: filter.categoryId,
          deletedAt: null,
        },
      },
    },
    filter?.templateId && {
      TemplateApplications: {
        some: {
          templateId: filter.templateId,
        },
      },
    },
    enforceVisible && {
      isStoreAccepted: true,
      isBlocked: false,
      branches: {
        some: {
          isActive: true,
          closed: false,
          temporarilyClosed: false,
        },
      },
    },
  ].filter(Boolean) as Prisma.StoreWhereInput[];

  const orderArray = [
    // إذا الأدمن مدّدش sort معيّن، بنرتب بـ storeOrder تصاعدياً (المطاعم اللي عليها رقم أول).
    // المطاعم اللي storeOrder بتاعها null بتيجي في الآخر عن طريق ثاني sort بالـ id.
    orderKey('storeOrder', 'storeOrder', orderBy),
    orderKey('id', 'id', orderBy),
  ].filter(Boolean) as Prisma.StoreOrderByWithRelationInput[];
  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray.length
      ? orderArray
      : [{ storeOrder: 'asc' }, { id: 'asc' }],
    where: {
      AND: searchArray,
    },
  } as Prisma.StoreFindManyArgs;
};

const selectTopServicesOBJ: Prisma.StoreSelect['Services'] = {
  where: {
    deletedAt: null,
    status: 'ACTIVE',
    available: true,
    Category: {
      deletedAt: null,
    },
  },
  orderBy: { totalOrders: 'desc' },
  take: 5,
  select: selectServiceOBJ(),
};

// `includeBundles` is opt-in: active bundles (with their nested scope rows) are only
// loaded for the store detail/profile view, not the store listing — the list endpoint
// returns many stores and the nested bundle/scope fetches would be a hot-path cost.
export const selectStoreOBJ = (includeBundles = false) => {
  const selectArgs: Prisma.StoreSelect = {
    id: true,
    name: true,
    logo: true,
    cover: true,
    createdAt: true,
    freeDelivery: true,
    isVerified: true,
    isBlocked: true,
    isStoreAccepted: true,
    managedByAdmin: true,
    commission: true,
    commissionType: true,
    storeOrder: true,
    prepTimeMinutes: true,
    deliveryTimeMinMinutes: true,
    deliveryTimeMaxMinutes: true,
    minOrderAmount: true,
    Services: selectTopServicesOBJ,
    branches: {
      where: { isActive: true },
      take: 10, // Fetch some branches to pick from if nearest service wasn't used
      include: {
        storeSchedule: true,
        favorites: true,
      },
    },
    User: {
      // `Store.User` is a list (owner + any employees can share a storeId) —
      // there's no dedicated "owner" flag, so the dashboard's edit form reads
      // User[0] as the owner. orderBy is required here so that's always the
      // earliest-created row, deterministically matching the exact same
      // "lowest id" heuristic StoreService.updateOwnerCredentials() uses to
      // pick who actually gets updated — without it, a store with employees
      // could show/edit a different account than the one whose password
      // change actually takes effect (a real DB-order dependent bug, not
      // just theoretical: Prisma/MySQL give no ordering guarantee here).
      orderBy: { id: 'asc' as const },
      // phone included so the admin dashboard's edit form can pre-fill it —
      // without it, editing anything on an existing store (e.g. just the
      // password) required re-typing a phone number the form had no way to
      // show, since a required field with nothing to prefill blocks submit.
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    },
    StoreCoupons: {
      where: {
        Coupon: {
          expired: false,
          active: true,
        },
      },
      select: {
        Coupon: true,
      },
    },
  };
  if (includeBundles) {
    selectArgs.Bundles = {
      where: validBundleWhere(),
      select: selectBundleOBJ(),
    };
  }
  return selectArgs;
};
export const selectStoreOBJWithFavourite = (
  customerId: Id,
  includeBundles = false,
) => {
  const selectArgs: Prisma.StoreSelect = {
    ...selectStoreOBJ(includeBundles),
    Favorites: {
      where: {
        customerId,
      },
    },
  } satisfies Prisma.StoreSelect & { isFavourite?: { id: Id }[] };
  return selectArgs;
};

export const getStoreArgsWithSelect = (
  customerId?: Id,
  includeBundles = false,
) => {
  let obj = selectStoreOBJ(includeBundles);
  if (customerId) {
    obj = selectStoreOBJWithFavourite(customerId, includeBundles);
  }
  return {
    select: obj,
  } satisfies Prisma.StoreFindManyArgs;
};
