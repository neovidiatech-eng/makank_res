import { Language, Order, OrderStatus, Prisma } from '@prisma/client';
import { resolveDateRangeFilter } from 'src/_modules/user/_modules/customer/prisma-args/customer.prisma-args';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey, orderKey } from 'src/globals/helpers/prisma-filters';
import { FilterOrderDTO } from '../dto/order.dto';

export const getOrderArgs = (query: FilterOrderDTO, languages: Language[]) => {
  const { orderBy, page, limit, ...filter } = query;
  const dateRange = resolveDateRangeFilter(query as any);
  const effectiveUserId = query.userId || query.customerId;

  const searchArray = [
    filterKey<Order>(filter, 'id'),
    filterKey<Order>(filter, 'status'),
    filterKey<Order>(filter, 'type'),
    filterKey<Order>(filter, 'branchId'),
    filterKey<Order>(filter, 'deliveryId'),
    filterKey<Order>(filter, 'zoneId'),
    effectiveUserId && { userId: Number(effectiveUserId) },
    dateRange && { date: dateRange },

    query.storeId && {
      Branch: {
        storeId: query?.storeId,
      },
    },
    query.current && {
      status: {
        notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      },
    },
    query.past && {
      status: {
        in: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      },
    },
    // Delivery-destination city: derived through the order's resolved zone (Zone.cityId).
    // Keeps city/zone on the same axis (City ⊃ Zone) and covers custom-delivery orders.
    query.cityId && {
      Zone: {
        cityId: query?.cityId,
      },
    },
    // Single search box: order id (exact, when numeric) OR customer name/phone
    // (substring — MySQL's default collation is already case-insensitive;
    // unlike Postgres/Mongo, Prisma's `mode: 'insensitive'` isn't valid here
    // and would throw at runtime).
    query.search && {
      OR: [
        !isNaN(Number(query.search)) && { id: Number(query.search) },
        { Customer: { name: { contains: query.search } } },
        { Customer: { phone: { contains: query.search } } },
      ].filter(Boolean) as Prisma.OrderWhereInput[],
    },
  ].filter(Boolean) as Prisma.OrderWhereInput[];

  const orderArray = [orderKey('id', 'id', orderBy)].filter(
    Boolean,
  ) as Prisma.OrderOrderByWithRelationInput[];

  if (orderArray.length === 0) {
    orderArray.push({ id: 'desc' });
  }

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray,
    where: {
      AND: searchArray,
    },
  } satisfies Prisma.OrderFindManyArgs;
};

export const selectOrderOBJ = (filters: FilterOrderDTO, userId?: Id) => {
  const isCustomer = userId ? { userId } : {};
  const selectArgs: Prisma.OrderSelect = {
    id: true,
    price: true,
    note: true,
    couponId: true,
    date: true,
    createdAt: true,
    addressId: true,
    adminNote: true,
    userId: true,
    totalPriceAfterDiscount: true,
    discountAmount: true,
    paidWithWallet: true,
    isGift: true,
    adminCommission: true,
    globalCommission: true,
    storeCommission: true,
    shipping: true,
    tax: true,
    paymentStatus: true,
    paymentMethod: true,
    status: true,
    type: true,
    branchId: true,
    deliveryId: true,
    transferNumber: true,
    transferImage: true,
    transferType: true,
    transferAccountNumber: true,
    deliveryLat: true,
    deliveryLng: true,
    // Custom-delivery fields
    pickupLat: true,
    pickupLng: true,
    itemsDescription: true,
    estimatedItemsCost: true,
    driverInstructions: true,
    // Which custom-delivery flavor this is (PURCHASE/RESTAURANT/ONLINE) — was
    // silently missing from this select, so callers could never actually see it.
    customDeliveryKind: true,
    packagingFee: true,
    // Zone the customer picked from a dropdown for a regular order — display
    // only, pricing still comes from the auto-resolved zoneId above.
    customerSelectedZoneId: true,
    CustomerSelectedZone: {
      select: { id: true, name: true },
    },
    zoneId: true,
    Zone: {
      select: { id: true, name: true },
    },
    Stations: {
      orderBy: { sequence: 'asc' },
      include: {
        Images: { select: { id: true, image: true }, orderBy: { id: 'asc' } },
        Zone: {
          select: { name: true },
        },
      },
    },
    Customer: {
      select: {
        name: true,
        phone: true,
        image: true,
      },
    },
    Complaints: {
      take: 1,
      select: {
        id: true,
        status: true,
      },
    },
    Branch: {
      select: {
        lat: true,
        lng: true,
        storeId: true,
      },
    },
    invoice: true,
    rated: true,
    DeliveryRating: true,
    Delivery: {
      select: {
        User: {
          select: {
            id: true,
            name: true,
            image: true,
            phone: true,

            email: true,
            DeliveryDetails: true,
          },
        },
      },
    },
    OrderItems: {
      include: {
        Service: {
          select: {
            id: true,
            durationMinutes: true,
            name: true,
            image: true,
            price: true,
            priceAfterDiscount: true,
            storeId: true,
            // Lets a "reorder"/order-history screen gray out a previously-
            // ordered product that's since been disabled or deactivated,
            // instead of the client having no signal at all.
            available: true,
            status: true,
            Store: {
              select: {
                ...(isCustomer
                  ? {
                      storeRatings: {
                        where: {
                          userId,
                        },
                      },
                    }
                  : {}),
                logo: true,
                cover: true,
                name: true,
                id: true,
              },
            },
          },
        },
        Size: true,
        OrderItemAddons: {
          include: {
            Addon: true,
          },
        },
        // Bundle offer this item belongs to (e.g. "buy 2 get 1 free") — was
        // missing, so callers only ever saw the raw orderBundleId/isFree with
        // no context on which offer it was or the free item's discount value.
        OrderBundle: true,
      },
    },
    StoreRating: true,
    Address: {
      select: {
        lat: true,
        adress: true,
        lng: true,
        title: true,
        default: true,
        id: true,
      },
    },
  };
  return selectArgs;
};
export const getOrderArgsWithSelect = (filter: FilterOrderDTO, userId?: Id) => {
  return {
    select: selectOrderOBJ(filter, userId),
  } satisfies Prisma.OrderFindManyArgs;
};
