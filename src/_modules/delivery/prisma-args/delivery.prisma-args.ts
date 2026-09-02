import { Prisma } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { selectUserOBJ } from 'src/_modules/user/prisma-args/user.prisma-select';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { resolveDateRangeFilter } from 'src/_modules/user/_modules/customer/prisma-args/customer.prisma-args';
import { DriverOrderFilterEnum, GetDeliveriesDTO } from '../dto/delivery.dto';

export const getDeliveryArgs = (query: GetDeliveriesDTO) => {
  const { page, limit } = query;
  const where = getDriverListWhere(query);

  return {
    ...paginateOrNot({ limit, page }, false),
    orderBy: [{ createdAt: 'desc' }],
    select: {
      ...selectUserOBJ(),
      DeliveryDetails: {
        include: {
          Schedule: true,
        },
      },
    },
    where,
  } satisfies Prisma.UserFindManyArgs;
};

/**
 * WHERE clause shared by the Driver Management listing/count. Mirrors the
 * filters supported by getDeliveryArgs (search over name/email/phone + the
 * DELIVERY role) so the new cards listing and its count stay in lockstep.
 */
export const getDriverListWhere = (
  query: GetDeliveriesDTO,
): Prisma.UserWhereInput => {
  const { search, active, availableNow, onShiftOnly, forceAvailable, zeroOrdersOnly, orderFilter } = query;

  const isAvailableNow = availableNow || onShiftOnly;

  const dateRange = resolveDateRangeFilter(query as any);

  const searchArray = [
    search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
            ...(Number.isInteger(Number(search)) && Number(search) > 0 ? [{ id: Number(search) }] : []),
          ],
        }
      : undefined,
    active !== undefined
      ? { active: (active as any) === 'true' || active === true }
      : undefined,
    isAvailableNow !== undefined || forceAvailable !== undefined
      ? {
          DeliveryDetails: {
            ...(isAvailableNow !== undefined && {
              availableNow:
                (isAvailableNow as any) === 'true' || isAvailableNow === true,
            }),
            ...(forceAvailable !== undefined && {
              forceAvailable:
                (forceAvailable as any) === 'true' || forceAvailable === true,
            }),
          },
        }
      : undefined,
    (zeroOrdersOnly || orderFilter === DriverOrderFilterEnum.ZERO_DELIVERED)
      ? {
          DeliveryOrders: {
            none: {
              status: 'DELIVERED',
            },
          },
        }
      : undefined,
    dateRange
      ? {
          OR: [
            { createdAt: dateRange },
            { DeliveryOrders: { some: { date: dateRange } } },
            { OrderDeliveryAssignment: { some: { assignedAt: dateRange } } },
          ],
        }
      : undefined,
    { roleKey: RolesKeys.DELIVERY },
  ].filter((x) => x) as Prisma.UserWhereInput[];

  return { AND: searchArray };
};

/**
 * Minimal select for the Driver Management cards listing. Returns everything a
 * card needs in one query (no per-driver follow-up), including the availability
 * (forceAvailable) and live shift (availableNow) flags from DeliveryDetails.
 */
export const selectDriverCardOBJ = () => {
  return {
    id: true,
    name: true,
    email: true,
    phone: true,
    image: true,
    verified: true,
    active: true,
    createdAt: true,
    DeliveryDetails: {
      select: {
        availableNow: true,
        forceAvailable: true,
      },
    },
  } satisfies Prisma.UserSelect;
};

/**
 * Select for a single row in the driver-dashboard orders table. Reuses the
 * persisted Order financial fields (shipping = delivery fee,
 * totalPriceAfterDiscount = invoice total) — no recomputation.
 *
 * Branch/OrderItems only apply to regular (restaurant) orders — a custom-
 * delivery order (any of the three kinds: PURCHASE/RESTAURANT/ONLINE) has no
 * branch and no order items, so zoneId/Zone/Stations are included here too,
 * otherwise this card showed nothing meaningful (no store name, no products)
 * for every custom-delivery order.
 */
export const selectDriverDashboardOrderOBJ = () => {
  return {
    id: true,
    note: true,
    status: true,
    type: true,
    date: true,
    createdAt: true,
    price: true,
    totalPriceAfterDiscount: true,
    shipping: true,
    tip: true,
    adminCommission: true,
    tax: true,
    packagingFee: true,
    discountAmount: true,
    paymentMethod: true,
    paidWithWallet: true,
    isPartnerStore: true,
    customDeliveryKind: true,
    zoneId: true,
    Zone: {
      select: { id: true, name: true },
    },
    Customer: {
      select: {
        id: true,
        name: true,
        phone: true,
      },
    },
    Branch: {
      select: {
        id: true,
        name: true,
        address: true,
        Store: { select: { id: true, name: true, logo: true, isPartner: true } },
      },
    },
    Address: {
      select: {
        id: true,
        title: true,
        adress: true,
        lat: true,
        lng: true,
      },
    },
    OrderItems: {
      select: {
        id: true,
        quantity: true,
        price: true,
        Service: { select: { id: true, name: true, image: true } },
      },
    },
    Stations: {
      orderBy: { sequence: 'asc' as const },
      select: {
        sequence: true,
        type: true,
        name: true,
        lat: true,
        lng: true,
        zoneId: true,
        Zone: { select: { id: true, name: true } },
        addressDetails: true,
        contactPhone: true,
      },
    },
  } satisfies Prisma.OrderSelect;
};
