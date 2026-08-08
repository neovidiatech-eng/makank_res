import { Prisma } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { selectUserOBJ } from 'src/_modules/user/prisma-args/user.prisma-select';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { DriverOrderFilterEnum, GetDeliveriesDTO } from '../dto/delivery.dto';

export const getDeliveryArgs = (query: GetDeliveriesDTO) => {
  const {
    page,
    limit,
    search,
    availableNow,
    bestRated,
    active,
    forceAvailable,
  } = query;

  const searchArray = [
    search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        }
      : undefined,
    active !== undefined
      ? { active: (active as any) === 'true' || active === true }
      : undefined,
    availableNow !== undefined ||
    bestRated !== undefined ||
    forceAvailable !== undefined
      ? {
          DeliveryDetails: {
            ...(availableNow !== undefined && {
              availableNow:
                (availableNow as any) === 'true' || availableNow === true,
            }),
            ...(bestRated !== undefined && {
              bestRated: (bestRated as any) === 'true' || bestRated === true,
            }),
            ...(forceAvailable !== undefined && {
              forceAvailable:
                (forceAvailable as any) === 'true' || forceAvailable === true,
            }),
          },
        }
      : undefined,
    {
      roleKey: RolesKeys.DELIVERY,
    },
  ]
    .filter((x) => x)
    .flat();

  return {
    ...paginateOrNot({ limit, page }, false),
    select: {
      ...selectUserOBJ(),
      DeliveryDetails: {
        include: {
          Schedule: true,
        },
      },
    },
    where: {
      AND: searchArray as any,
    },
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

  const searchArray = [
    search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
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
    createdAt: true,
    totalPriceAfterDiscount: true,
    shipping: true,
    tip: true,
    type: true,
    customDeliveryKind: true,
    zoneId: true,
    Zone: {
      select: { name: true },
    },
    Customer: {
      select: {
        name: true,
        phone: true,
      },
    },
    Branch: {
      select: {
        name: true,
        Store: { select: { name: true } },
      },
    },
    OrderItems: {
      select: {
        quantity: true,
        Service: { select: { name: true } },
      },
    },
    // Custom-delivery stops (Purchase/Restaurant/Online) — each carries its own
    // zone/address, which is the whole "product" this order type has.
    Stations: {
      orderBy: { sequence: 'asc' as const },
      select: {
        sequence: true,
        type: true,
        name: true,
        lat: true,
        lng: true,
        zoneId: true,
        Zone: { select: { name: true } },
        addressDetails: true,
        contactPhone: true,
      },
    },
  } satisfies Prisma.OrderSelect;
};
