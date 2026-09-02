import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword } from 'src/globals/helpers/password.helpers';
import { PrismaService } from 'src/globals/services/prisma.service';
import { RolesKeys } from '../authorization/providers/roles';
import {
  CreateDeliveryDTO,
  CreateDeliveryScheduleDTO,
  DeliveryScheduleDTO,
  DriverOrderFilterEnum,
  GetDeliveriesDTO,
  GetDeliveryStatisticsDTO,
  GetDriverDashboardDTO,
  UpdateDeliveryDTO,
} from './dto/delivery.dto';

import { AssignmentStatus, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { resolveDateRangeFilter } from 'src/_modules/user/_modules/customer/prisma-args/customer.prisma-args';
import {
  egyptNowParts,
  egyptWallClockToTimeColumn,
  formatEgypt,
  timeColumnToMinutes,
} from 'src/globals/helpers/egypt-time.helper';
import { paginationParams } from 'src/globals/helpers/pagination-params';
import { AfkBreakService } from 'src/globals/services/afk-break.service';
import { OrderTrackingGateway } from '../order/gateways/order-tracking.gateway';
import {
  getDeliveryArgs,
  getDriverListWhere,
  selectDriverCardOBJ,
  selectDriverDashboardOrderOBJ,
} from './prisma-args/delivery.prisma-args';
import { DeliveryScheduleHelpersService } from './services/delivery.schedule.helper.service';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryScheduleHelpers: DeliveryScheduleHelpersService,
    private readonly orderTrackingGateway: OrderTrackingGateway,
    private readonly afkBreakService: AfkBreakService,
  ) {}

  private async breakUntilLabel(userId: number): Promise<string> {
    const breakUntil = await this.afkBreakService.getBreakUntil(userId);
    if (!breakUntil) return '';
    // Egypt wall-clock (server runs UTC); raw getHours() would be off by the Cairo offset.
    return formatEgypt(breakUntil);
  }

  async attachOrderStatsToDrivers(drivers: any[], filters?: GetDeliveriesDTO) {
    if (!drivers || drivers.length === 0) return drivers;
    const driverIds = drivers.map((d) => d?.id).filter(Boolean);
    if (driverIds.length === 0) return drivers;

    const dateRange = filters ? resolveDateRangeFilter(filters as any) : null;
    const orderDateFilter = dateRange
      ? { OR: [{ date: dateRange }, { createdAt: dateRange }] }
      : { date: { gte: this.dayRange().start, lte: this.dayRange().end } };

    const [
      allTimeOrdersGrouped,
      periodOrdersGrouped,
      activeOrdersGrouped,
      rejectedAssignmentsGrouped,
      activeOrders,
    ] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['deliveryId', 'status'],
        where: { deliveryId: { in: driverIds } },
        _count: { id: true },
        _sum: { shipping: true },
      }),
      this.prisma.order.groupBy({
        by: ['deliveryId', 'status'],
        where: { deliveryId: { in: driverIds }, ...orderDateFilter },
        _count: { id: true },
        _sum: { shipping: true },
      }),
      this.prisma.order.groupBy({
        by: ['deliveryId'],
        where: {
          deliveryId: { in: driverIds },
          status: {
            in: [
              OrderStatus.PREPARING,
              OrderStatus.READY_PICKUP,
              OrderStatus.ON_THE_WAY,
            ],
          },
        },
        _count: { id: true },
      }),
      this.prisma.orderDeliveryAssignment.groupBy({
        by: ['deliveryId'],
        where: {
          deliveryId: { in: driverIds },
          status: { in: [AssignmentStatus.REJECTED, AssignmentStatus.TIMEOUT] },
        },
        _count: { id: true },
      }),
      this.prisma.order.findMany({
        where: {
          deliveryId: { in: driverIds },
          status: {
            in: [
              OrderStatus.PENDING,
              OrderStatus.PREPARING,
              OrderStatus.READY_PICKUP,
              OrderStatus.ON_THE_WAY,
            ],
          },
        },
        select: {
          id: true,
          status: true,
          deliveryId: true,
          date: true,
          Branch: {
            select: {
              Store: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const driverStatsMap = new Map<
      number,
      {
        todayDelivered: number;
        totalDelivered: number;
        activeOrders: number;
        todayEarnings: number;
        totalEarnings: number;
        rejectedAssignments: number;
      }
    >();

    const getStats = (id: number) => {
      let stats = driverStatsMap.get(id);
      if (!stats) {
        stats = {
          todayDelivered: 0,
          totalDelivered: 0,
          activeOrders: 0,
          todayEarnings: 0,
          totalEarnings: 0,
          rejectedAssignments: 0,
        };
        driverStatsMap.set(id, stats);
      }
      return stats;
    };

    for (const item of allTimeOrdersGrouped) {
      if (!item.deliveryId) continue;
      const stats = getStats(item.deliveryId);
      const count = item._count.id;
      if (item.status === OrderStatus.DELIVERED) {
        stats.totalDelivered += count;
        stats.totalEarnings += item._sum.shipping ?? 0;
      }
    }

    for (const item of periodOrdersGrouped) {
      if (!item.deliveryId) continue;
      const stats = getStats(item.deliveryId);
      const count = item._count.id;
      if (item.status === OrderStatus.DELIVERED) {
        stats.todayDelivered += count;
        stats.todayEarnings += item._sum.shipping ?? 0;
      }
    }

    for (const item of activeOrdersGrouped) {
      if (!item.deliveryId) continue;
      const stats = getStats(item.deliveryId);
      stats.activeOrders = item._count.id;
    }

    for (const item of rejectedAssignmentsGrouped) {
      if (!item.deliveryId) continue;
      const stats = getStats(item.deliveryId);
      stats.rejectedAssignments = item._count.id;
    }

    const activeOrderMap = new Map<number, any>();
    for (const order of activeOrders) {
      if (order.deliveryId) {
        activeOrderMap.set(order.deliveryId, {
          id: order.id,
          status: order.status,
          storeName: order.Branch?.Store?.name ?? null,
          date: order.date,
        });
      }
    }

    return drivers.map((driver) => {
      if (!driver) return driver;
      const stats = driverStatsMap.get(driver.id) || {
        todayDelivered: 0,
        totalDelivered: 0,
        activeOrders: 0,
        todayEarnings: 0,
        totalEarnings: 0,
        rejectedAssignments: 0,
      };
      return {
        ...driver,
        orderStats: stats,
        currentOrder: activeOrderMap.get(driver.id) ?? null,
      };
    });
  }

  async findAll(query: GetDeliveriesDTO) {
    const args = getDeliveryArgs(query);
    const [data, count] = await Promise.all([
      this.prisma.user.findMany(args),
      this.prisma.user.count({ where: args.where }),
    ]);
    const enrichedData = await this.attachOrderStatsToDrivers(data, query);
    return { data: enrichedData, count };
  }

  async count(query: GetDeliveriesDTO) {
    const args = getDeliveryArgs(query);
    return this.prisma.user.count({ where: args.where });
  }

  /**
   * Driver Management cards listing. Returns one flat card per driver
   * (id, name, email, phone, avatar, isVerified, isAvailable, isOnShift,
   * createdAt, orderStats) plus { page, limit, total, totalPages } pagination & summary.
   */
  async findAllForDashboard(query: GetDeliveriesDTO) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const where = getDriverListWhere(query);
    const pagination = paginationParams({ page, limit });

    const { start: todayStart, end: todayEnd } = this.dayRange();
    const todayFilter = { gte: todayStart, lte: todayEnd };

    const [allDriversRows, total, onShiftDriversCount, todayDeliveredAggregate] =
      await Promise.all([
        this.prisma.user.findMany({
          where,
          select: selectDriverCardOBJ(),
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.user.count({ where }),
        this.prisma.deliveryDetails.count({
          where: { availableNow: true },
        }),
        this.prisma.order.aggregate({
          where: { status: OrderStatus.DELIVERED, date: todayFilter },
          _count: { id: true },
          _sum: { shipping: true },
        }),
      ]);

    let data = allDriversRows.map((row) => {
      const details = row.DeliveryDetails;
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        avatar: row.image ?? null,
        isVerified: row.verified,
        isActive: row.active,
        // "متاح إجباري" — always-available toggle (forceAvailable)
        isAvailable: details?.forceAvailable ?? false,
        // "شغال النهاردة" — live shift status (availableNow)
        isOnShift: details?.availableNow ?? false,
        createdAt: row.createdAt,
      };
    });

    data = await this.attachOrderStatsToDrivers(data);

    if (query.orderFilter) {
      if (query.orderFilter === DriverOrderFilterEnum.MOST_DELIVERED) {
        data.sort(
          (a: any, b: any) =>
            (b.orderStats?.totalDelivered ?? 0) -
            (a.orderStats?.totalDelivered ?? 0),
        );
      } else if (query.orderFilter === DriverOrderFilterEnum.LEAST_DELIVERED) {
        data.sort(
          (a: any, b: any) =>
            (a.orderStats?.totalDelivered ?? 0) -
            (b.orderStats?.totalDelivered ?? 0),
        );
      } else if (query.orderFilter === DriverOrderFilterEnum.MOST_TODAY) {
        data.sort(
          (a: any, b: any) =>
            (b.orderStats?.todayDelivered ?? 0) -
            (a.orderStats?.todayDelivered ?? 0),
        );
      } else if (query.orderFilter === DriverOrderFilterEnum.MOST_REJECTED) {
        data.sort(
          (a: any, b: any) =>
            (b.orderStats?.rejectedAssignments ?? 0) -
            (a.orderStats?.rejectedAssignments ?? 0),
        );
      } else if (query.orderFilter === DriverOrderFilterEnum.MOST_EARNINGS) {
        data.sort(
          (a: any, b: any) =>
            (b.orderStats?.todayEarnings ?? 0) -
            (a.orderStats?.todayEarnings ?? 0),
        );
      }
    }

    const totalMatching = data.length;
    const effectiveLimit = pagination?.limit ?? totalMatching;
    const paginatedData = pagination
      ? data.slice(
          (pagination.page - 1) * pagination.limit,
          pagination.page * pagination.limit,
        )
      : data;

    return {
      data: paginatedData,
      summary: {
        totalDrivers: total,
        onShiftDrivers: onShiftDriversCount,
        todayTotalDelivered: todayDeliveredAggregate._count.id ?? 0,
        todayTotalEarnings: todayDeliveredAggregate._sum.shipping ?? 0,
      },
      pagination: {
        page: pagination?.page ?? 1,
        limit: effectiveLimit,
        total: totalMatching,
        totalPages:
          effectiveLimit > 0 ? Math.ceil(totalMatching / effectiveLimit) : 0,
      },
    };
  }

  /**
   * Builds the inclusive [start, end] bounds of a calendar day for use against
   * the Order.date field. Mirrors the plain-Date filtering already used by
   * getStatistics (no new timezone abstraction introduced).
   */
  private dayRange(date?: Date): { start: Date; end: Date } {
    const base = date ? new Date(date) : new Date();
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const end = new Date(base);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  /**
   * Driver details dashboard for a selected day. Reuses the persisted Order
   * financial fields (shipping = delivery fee, totalPriceAfterDiscount = order
   * total, adminCommission = platform commission) — these are computed and
   * stored at order creation/completion time, so we aggregate, never recompute.
   *
   * - accepted/rejected counts come from OrderDeliveryAssignment (the system's
   *   own assignment-response record): ACCEPTED, and REJECTED|TIMEOUT as the
   *   "rejected" bucket (a timeout is treated as a missed/declined order, in
   *   line with timer.service marking lapses TIMEOUT).
   * - delivered = OrderStatus.DELIVERED only.
   */
  async getDriverDashboard(id: number, query: GetDriverDashboardDTO) {
    const driver = await this.prisma.user.findFirst({
      where: { id, roleKey: RolesKeys.DELIVERY },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,
        verified: true,
        active: true,
        DeliveryDetails: {
          select: {
            availableNow: true,
            forceAvailable: true,
          },
        },
        Details: {
          select: {
            wallet: true,
            collectedCash: true,
            unsettledCommission: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Delivery person not found');
    }

    let dateFilter: any = undefined;
    if (query.fromDate || query.toDate) {
      const gte = query.fromDate ? new Date(query.fromDate) : undefined;
      if (gte) gte.setHours(0, 0, 0, 0);
      const lte = query.toDate ? new Date(query.toDate) : undefined;
      if (lte) lte.setHours(23, 59, 59, 999);

      dateFilter = {
        ...(gte && { gte }),
        ...(lte && { lte }),
      };
    } else if (query.date) {
      const { start, end } = this.dayRange(query.date);
      dateFilter = { gte: start, lte: end };
    } else {
      const { start, end } = this.dayRange();
      dateFilter = { gte: start, lte: end };
    }

    const assignedAtFilter = dateFilter ? { assignedAt: dateFilter } : {};
    const orderDateFilter = dateFilter
      ? { OR: [{ date: dateFilter }, { createdAt: dateFilter }] }
      : {};

    const [
      acceptedAssignments,
      rejectedAssignments,
      deliveredCount,
      financials,
      cashFinancials,
      orders,
      deliveredOrdersList,
    ] = await Promise.all([
      // Accepted (assignment accepted by this driver)
      this.prisma.orderDeliveryAssignment.count({
        where: {
          deliveryId: id,
          status: AssignmentStatus.ACCEPTED,
          ...assignedAtFilter,
        },
      }),
      // Rejected = explicit REJECTED + lapsed TIMEOUT
      this.prisma.orderDeliveryAssignment.count({
        where: {
          deliveryId: id,
          status: { in: [AssignmentStatus.REJECTED, AssignmentStatus.TIMEOUT] },
          ...assignedAtFilter,
        },
      }),
      this.prisma.order.count({
        where: {
          deliveryId: id,
          status: OrderStatus.DELIVERED,
          ...orderDateFilter,
        },
      }),
      // Financials MUST ONLY include DELIVERED orders!
      this.prisma.order.aggregate({
        where: {
          deliveryId: id,
          status: OrderStatus.DELIVERED,
          ...orderDateFilter,
        },
        _sum: {
          totalPriceAfterDiscount: true,
          shipping: true,
          adminCommission: true,
          tip: true,
        },
      }),
      // Cash collected MUST ONLY include DELIVERED orders paid via CASH!
      this.prisma.order.aggregate({
        where: {
          deliveryId: id,
          status: OrderStatus.DELIVERED,
          paymentMethod: PaymentMethod.CASH,
          ...orderDateFilter,
        },
        _sum: {
          totalPriceAfterDiscount: true,
        },
      }),
      this.prisma.order.findMany({
        where: { deliveryId: id, ...orderDateFilter },
        select: selectDriverDashboardOrderOBJ(),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.findMany({
        where: {
          deliveryId: id,
          status: OrderStatus.DELIVERED,
          ...orderDateFilter,
        },
        select: {
          totalPriceAfterDiscount: true,
          shipping: true,
          adminCommission: true,
          tax: true,
          packagingFee: true,
          paymentMethod: true,
          paidWithWallet: true,
        },
      }),
    ]);

    const details = driver.DeliveryDetails;
    const collectedCashPeriod = cashFinancials._sum.totalPriceAfterDiscount ?? 0;
    const isFilteredPeriod = Boolean(query.fromDate || query.toDate || query.date);

    let productsPriceOffline = 0;
    let productsPriceOnline = 0;

    deliveredOrdersList.forEach((o) => {
      const isOffline = o.paymentMethod === PaymentMethod.CASH && !o.paidWithWallet;
      const orderTotal = o.totalPriceAfterDiscount || 0;
      const productsOnly = Math.max(
        0,
        orderTotal - (o.shipping || 0) - (o.adminCommission || 0) - (o.tax || 0) - (o.packagingFee || 0),
      );

      if (isOffline) {
        productsPriceOffline += productsOnly;
      } else {
        productsPriceOnline += productsOnly;
      }
    });

    return {
      profile: {
        id: driver.id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        avatar: driver.image ?? null,
        isVerified: driver.verified,
        isActive: driver.active,
        isAvailable: details?.forceAvailable ?? false,
        isOnShift: details?.availableNow ?? false,
      },
      statistics: {
        acceptedOrders: acceptedAssignments,
        rejectedOrders: rejectedAssignments,
        deliveredOrders: deliveredCount,
      },
      financialSummary: {
        driverEarnings: financials._sum.shipping ?? 0,
        collectedCash: isFilteredPeriod
          ? collectedCashPeriod
          : (driver.Details?.collectedCash ?? 0),
        totalAdminDebt: driver.Details?.unsettledCommission ?? 0,
        adminCommissionOnly: financials._sum.adminCommission ?? 0,
        partnerProductsDebt: Math.max(0, (driver.Details?.unsettledCommission ?? 0) - (financials._sum.adminCommission ?? 0)),
        productsPriceOffline,
        productsPriceOnline,
        netProductsPriceTotal: productsPriceOffline + productsPriceOnline,
        totalOrdersAmount: financials._sum.totalPriceAfterDiscount ?? 0,
        deliveryFees: financials._sum.shipping ?? 0,
        tips: financials._sum.tip ?? 0,
        adminCommission: financials._sum.adminCommission ?? 0,
        walletBalance: driver.Details?.wallet ?? 0,
      },
      acceptanceSummary: {
        acceptedOrders: acceptedAssignments,
        rejectedOrders: rejectedAssignments,
      },
      orders: orders.map((order) => {
        const isOnline = order.paymentMethod !== 'CASH' || order.paidWithWallet;
        const totalAmount = order.totalPriceAfterDiscount || order.price || 0;
        const shippingFee = order.shipping || 0;
        const adminCommission = order.adminCommission || 0;
        const collectAmount = isOnline ? 0 : totalAmount;
        const isPartner = Boolean(order.isPartnerStore || order.Branch?.Store?.isPartner);
        const payToStore = isPartner
          ? 0
          : Math.max(0, totalAmount - shippingFee - adminCommission - (order.tax || 0) - (order.packagingFee || 0));

        return {
          id: order.id,
          status: order.status,
          type: order.type,
          price: order.price ?? totalAmount,
          totalPriceAfterDiscount: totalAmount,
          shipping: shippingFee,
          deliveryFee: shippingFee,
          deliveryPrice: shippingFee,
          driverEarnings: shippingFee,
          tip: order.tip ?? 0,
          adminCommission,
          tax: order.tax ?? 0,
          packagingFee: order.packagingFee ?? 0,
          discountAmount: order.discountAmount ?? 0,
          createdAt: order.createdAt,
          date: order.date ?? order.createdAt,
          paymentMethod: order.paymentMethod,
          paidWithWallet: order.paidWithWallet,
          Customer: order.Customer
            ? {
                id: order.Customer.id,
                name: order.Customer.name,
                phone: order.Customer.phone,
              }
            : null,
          Branch: order.Branch
            ? {
                id: order.Branch.id,
                name: order.Branch.name,
                address: order.Branch.address,
                Store: order.Branch.Store
                  ? {
                      id: order.Branch.Store.id,
                      name: order.Branch.Store.name,
                      logo: order.Branch.Store.logo,
                      isPartner: order.Branch.Store.isPartner,
                    }
                  : null,
              }
            : null,
          Address: order.Address
            ? {
                id: order.Address.id,
                address: order.Address.adress,
                details: order.Address.title,
                lat: order.Address.lat,
                lng: order.Address.lng,
                Zone: order.Zone
                  ? {
                      id: order.Zone.id,
                      name: order.Zone.name,
                    }
                  : null,
              }
            : null,
          isPartnerStore: isPartner,
          partnerStoreNotice: isPartner
            ? 'مطعم شريك - لا تدفع مبالغ للمطعم عند الاستلام'
            : null,
          paymentDetails: {
            isOnlinePayment: isOnline,
            isPaid: isOnline,
            collectFromCustomerAmount: collectAmount,
            driverEarnings: shippingFee,
            payToStoreAmount: payToStore,
            paymentMethodName: order.paymentMethod,
            paymentMethod: order.paymentMethod,
            paymentStatus: isOnline ? 'PAID' : 'PENDING',
            paymentGroup: !isOnline
              ? (isPartner ? 'OFFLINE_PARTNER' : 'OFFLINE')
              : (isPartner ? 'ONLINE_PARTNER' : 'ONLINE'),
            paymentTypeLabel: isOnline ? 'دفع إلكتروني / محفظة' : 'دفع عند الاستلام (كاش)',
          },
          financialBreakdown: {
            totalPriceAfterDiscount: totalAmount,
            productSubtotal: Math.max(0, totalAmount - shippingFee - adminCommission),
            shippingFee: shippingFee,
            driverEarnings: shippingFee,
            adminCommission,
            storeNetEarnings: payToStore,
            payToStoreAmount: payToStore,
          },
          OrderItems: (order.OrderItems ?? []).map((item) => ({
            id: item.id,
            quantity: item.quantity,
            price: item.price,
            Service: item.Service ? { id: item.Service.id, name: item.Service.name, image: item.Service.image } : null,
          })),
          customerName: order.Customer?.name ?? null,
          customerPhone: order.Customer?.phone ?? null,
          storeName: order.Branch?.Store?.name ?? order.Branch?.name ?? null,
          productsSummary: (order.OrderItems ?? []).map((item) => ({
            quantity: item.quantity,
            name: item.Service?.name ?? null,
          })),
          customDeliveryKind: order.customDeliveryKind ?? null,
          zoneId: order.zoneId,
          zoneName: order.Zone?.name ?? null,
          stations: (order.Stations ?? []).map((station) => ({
            sequence: station.sequence,
            type: station.type,
            name: station.name,
            lat: station.lat,
            lng: station.lng,
            zoneId: station.zoneId,
            zoneName: station.Zone?.name ?? null,
            addressDetails: station.addressDetails,
            contactPhone: station.contactPhone,
          })),
          invoiceTotal: totalAmount,
          notes: order.note ?? null,
        };
      }),
    };
  }

  async create(data: CreateDeliveryDTO, currentUser: CurrentUser) {
    const { forceAvailable, ...rest } = data;

    let existingDelivery = rest.phone
      ? await this.prisma.user.findUnique({
          where: {
            phone_roleKey: {
              phone: rest.phone,
              roleKey: RolesKeys.DELIVERY,
            },
          },
          select: {
            email: true,
            phone: true,
            id: true,
            name: true,
            verified: true,
          },
          __includeDeleted: true as never,
        })
      : null;

    if (!existingDelivery) {
      existingDelivery = await this.prisma.user.findUnique({
        where: {
          email_roleKey: {
            email: rest.email,
            roleKey: RolesKeys.DELIVERY,
          },
        },
        select: {
          email: true,
          phone: true,
          id: true,
          name: true,
          verified: true,
        },
        __includeDeleted: true as never,
      });
    }

    if (existingDelivery && existingDelivery.verified) {
      throw new ConflictException('Delivery person already exists');
    }

    const hashedPassword = hashPassword(rest.password);
    rest.password = hashedPassword;

    if (existingDelivery && existingDelivery.email !== rest.email) {
      return await this.prisma.user.update({
        where: { id: existingDelivery.id },
        data: {
          email: rest.email,
          active:
            currentUser && currentUser.Role.roleKey === RolesKeys.ADMIN
              ? true
              : false,
          DeliveryDetails: {
            upsert: {
              where: { userId: existingDelivery.id },
              create: {
                lat: 0,
                lng: 0,
                availableNow: forceAvailable || false,
                forceAvailable: forceAvailable || false,
              },
              update: {
                availableNow: forceAvailable || false,
                forceAvailable: forceAvailable || false,
              },
            },
          },
        },
      });
    }

    if (
      existingDelivery &&
      rest.phone &&
      existingDelivery.phone !== rest.phone
    ) {
      return await this.prisma.user.update({
        where: { id: existingDelivery.id },
        data: {
          phone: rest.phone,
          active:
            currentUser && currentUser.Role.roleKey === RolesKeys.ADMIN
              ? true
              : false,
          DeliveryDetails: {
            upsert: {
              where: { userId: existingDelivery.id },
              create: {
                lat: 0,
                lng: 0,
                availableNow: forceAvailable || false,
                forceAvailable: forceAvailable || false,
              },
              update: {
                availableNow: forceAvailable || false,
                forceAvailable: forceAvailable || false,
              },
            },
          },
        },
      });
    }

    if (existingDelivery) {
      return await this.prisma.user.update({
        where: { id: existingDelivery.id },
        data: {
          password: rest.password,
          name: rest.name,
          active:
            currentUser && currentUser.Role.roleKey === RolesKeys.ADMIN
              ? true
              : false,
          DeliveryDetails: {
            upsert: {
              where: { userId: existingDelivery.id },
              create: {
                lat: 0,
                lng: 0,
                availableNow: forceAvailable || false,
                forceAvailable: forceAvailable || false,
              },
              update: {
                availableNow: forceAvailable || false,
                forceAvailable: forceAvailable || false,
              },
            },
          },
        },
      });
    }
    const role = await this.prisma.role.findFirst({
      where: { roleKey: RolesKeys.DELIVERY },
    });

    const response = await this.prisma.user.create({
      data: {
        ...rest,
        roleId: role.id,
        active:
          currentUser && currentUser.Role.roleKey === RolesKeys.ADMIN
            ? true
            : false,
        roleKey: RolesKeys.DELIVERY,
        DeliveryDetails: {
          create: {
            lat: 0,
            lng: 0,
            availableNow: forceAvailable || false,
            forceAvailable: forceAvailable || false,
          },
        },
      },
      select: { email: true, phone: true, id: true, name: true },
    });

    return response;
  }

  async findOne(id: number) {
    const delivery = await this.prisma.user.findFirst({
      where: { id, roleKey: RolesKeys.DELIVERY },
      include: {
        DeliveryDetails: {
          include: {
            Schedule: true,
          },
        },
      },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery person not found');
    }

    return delivery;
  }

  async updateSchedule(deliveryId: number, data: DeliveryScheduleDTO) {
    const { schedule } = data;
    await this.prisma.deliverySchedule.deleteMany({
      where: { deliveryId },
    });

    const result = await this.prisma.deliverySchedule.createMany({
      data: schedule.map((s) => ({
        ...s,
        deliveryId,
        // Persist the Egypt wall-clock "HH:mm" verbatim (Option A) — no timezone conversion.
        openingTime: egyptWallClockToTimeColumn(s.openingTime),
        closingTime: egyptWallClockToTimeColumn(s.closingTime),
      })),
    });

    await this.deliveryScheduleHelpers.syncDeliveryAvailability(deliveryId);

    return result;
  }

  async update(id: number, data: UpdateDeliveryDTO) {
    if (!id || isNaN(id)) {
      throw new BadRequestException('Invalid driver ID');
    }

    // Destructure ALL known DTO fields explicitly so that `...rest` is empty
    // and we never accidentally pass unknown fields into prisma.user.update.
    const {
      active,
      verified,
      forceAvailable,
      isOnShift,
      availableNow,
      isAvailable,
      password,
      newPassword,
      name,
      email,
      phone,
    } = data;

    const requestedAvailable = isAvailable ?? isOnShift ?? availableNow;
    const rawPassword = newPassword || password;

    let hashedPassword: string | undefined;
    if (rawPassword != null && String(rawPassword).trim().length > 0) {
      hashedPassword = hashPassword(String(rawPassword).trim());
    }

    // Don't allow re-enabling availability while a forced AFK break is active.
    if (forceAvailable === true && (await this.afkBreakService.isOnBreak(id))) {
      throw new ConflictException(
        `Driver is on a break until ${await this.breakUntilLabel(id)}`,
      );
    }

    // Build only the User-model fields that were actually provided.
    const userUpdateData: Prisma.UserUpdateInput = {};
    if (name !== undefined)          userUpdateData.name     = name;
    if (email !== undefined)         userUpdateData.email    = email;
    if (phone !== undefined)         userUpdateData.phone    = phone;
    if (active !== undefined)        userUpdateData.active   = active;
    if (verified !== undefined)      userUpdateData.verified = verified;
    if (hashedPassword !== undefined) userUpdateData.password = hashedPassword;

    const result = await this.prisma.user.update({
      where: { id },
      data: userUpdateData,
    });

    const deliveryDetailsUpdate: Prisma.DeliveryDetailsUpdateInput = {};
    if (forceAvailable !== undefined) {
      deliveryDetailsUpdate.forceAvailable = forceAvailable;
      if (forceAvailable === true) {
        deliveryDetailsUpdate.availableNow = true;
      }
    }
    if (requestedAvailable !== undefined) {
      deliveryDetailsUpdate.availableNow = requestedAvailable;
    }

    const hasDetailsUpdate = Object.keys(deliveryDetailsUpdate).length > 0;

    if (hasDetailsUpdate) {
      await this.prisma.deliveryDetails.upsert({
        where: { userId: id },
        update: deliveryDetailsUpdate,
        create: {
          userId: id,
          lat: 0,
          lng: 0,
          forceAvailable: forceAvailable ?? false,
          availableNow: requestedAvailable ?? forceAvailable ?? false,
        },
      });
      await this.deliveryScheduleHelpers.syncDeliveryAvailability(id);
    }

    return result;
  }

  async remove(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Delivery person not found');
    }

    // Obfuscate phone and email before deletion to free up the unique constraint
    await this.prisma.user.update({
      where: { id },
      data: {
        phone: user.phone ? `deleted-${user.phone}-${id}` : null,
        email: `deleted-${user.email}-${id}`,
      },
    });

    return await this.prisma.user.delete({
      where: { id },
    });
  }

  async updateLocation(
    deliveryId: number,
    lat: number,
    lng: number,
    bearing?: number,
  ) {
    const updated = await this.prisma.deliveryDetails.upsert({
      where: { userId: deliveryId },
      update: {
        lat,
        lng,
        bearing,
        lastLocationUpdate: new Date(),
      },
      create: {
        userId: deliveryId,
        lat,
        lng,
        bearing,
        lastLocationUpdate: new Date(),
      },
    });

    const activeOrders = await this.prisma.order.findMany({
      where: {
        deliveryId,
        status: {
          in: [
            OrderStatus.PREPARING,
            OrderStatus.READY_PICKUP,
            OrderStatus.ON_THE_WAY,
          ],
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    for (const order of activeOrders) {
      if (order.status === OrderStatus.ON_THE_WAY) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            deliveryLat: lat,
            deliveryLng: lng,
          },
        });
      }

      this.orderTrackingGateway.broadcastLocationUpdate(order.id, {
        deliveryBoyId: deliveryId,
        lat: updated.lat,
        lng: updated.lng,
        bearing: updated.bearing,
        lastSeen: updated.lastLocationUpdate || new Date(),
      });
    }

    return updated;
  }

  async getStatistics(deliveryId: number, query: GetDeliveryStatisticsDTO) {
    const { fromDate, toDate } = query;
    const dateFilter: any = {};

    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) dateFilter.lte = new Date(toDate);

    const [earnings, activeOrders, completedOrders] = await Promise.all([
      this.prisma.order.aggregate({
        _sum: {
          shipping: true,
        },
        where: {
          deliveryId,
          status: 'DELIVERED',
          date: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        },
      }),
      this.prisma.order.count({
        where: {
          deliveryId,
          status: {
            in: ['ON_THE_WAY', 'READY_PICKUP', 'PREPARING'],
          },
        },
      }),
      this.prisma.order.count({
        where: {
          deliveryId,
          status: 'DELIVERED',
          date: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        },
      }),
    ]);

    return {
      activeOrders,
      totalEarnings: earnings._sum.shipping || 0,
      completedOrders,
    };
  }

  async createSchedule(data: CreateDeliveryScheduleDTO, deliveryId: number) {
    const {
      day,
      openingTime,
      closingTime,
      requiredLat,
      requiredLng,
      requiredRadius,
    } = data;

    await this.deliveryScheduleHelpers.scheduleOverlap(deliveryId, data);

    const schedule = await this.prisma.deliverySchedule.create({
      data: {
        day,
        // Persist the Egypt wall-clock "HH:mm" verbatim (Option A) — no timezone conversion.
        openingTime: egyptWallClockToTimeColumn(openingTime),
        closingTime: egyptWallClockToTimeColumn(closingTime),
        deliveryId,
        requiredLat,
        requiredLng,
        requiredRadius,
      },
    });

    await this.deliveryScheduleHelpers.syncDeliveryAvailability(deliveryId);

    return schedule;
  }

  async deleteSchedule(id: number) {
    const schedule = await this.prisma.deliverySchedule.delete({
      where: { id },
      select: { id: true, deliveryId: true },
    });

    await this.deliveryScheduleHelpers.syncDeliveryAvailability(
      schedule.deliveryId,
    );

    return schedule;
  }

  async getSchedule(deliveryId: number) {
    return await this.prisma.deliverySchedule.findMany({
      where: { deliveryId },
    });
  }

  async checkIn(
    deliveryId: number,
    scheduleId: number,
    data: { lat: number; lng: number },
  ) {
    if (await this.afkBreakService.isOnBreak(deliveryId)) {
      throw new ConflictException(
        `You are on a break until ${await this.breakUntilLabel(deliveryId)}`,
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: deliveryId },
      select: { DeliveryDetails: true },
    });
    if (user?.DeliveryDetails?.availableNow) {
      throw new ConflictException('You are already checked in');
    }
    const schedule = await this.prisma.deliverySchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule || schedule.deliveryId !== deliveryId) {
      throw new NotFoundException(
        'Schedule not found for this delivery person',
      );
    }

    // Egypt wall-clock (DST-correct, server-TZ-independent). Schedule TIME
    // columns hold the literal Egypt wall-clock (Option A), read with zero offset.
    const np = egyptNowParts();
    const currentDay = np.dayOfWeek;

    if (schedule.day !== currentDay) {
      throw new ConflictException(
        `Today is ${currentDay}, but this schedule is for ${schedule.day}`,
      );
    }

    const nowMinutes = np.minutesOfDay;
    const openingMinutes = timeColumnToMinutes(schedule.openingTime);
    const closingMinutes = timeColumnToMinutes(schedule.closingTime);

    if (nowMinutes < openingMinutes) {
      throw new ConflictException('The shift has not started yet');
    }
    if (nowMinutes > closingMinutes) {
      throw new ConflictException('The shift has already ended');
    }

    if (schedule.requiredLat && schedule.requiredLng) {
      const distance = this.getDistance(
        data.lat,
        data.lng,
        schedule.requiredLat,
        schedule.requiredLng,
      );
      const radius = schedule.requiredRadius || 100;

      if (distance > radius) {
        throw new ConflictException(
          `You are too far from the required location. Distance: ${Math.round(distance)}m, allowed: ${radius}m`,
        );
      }
    }

    const attendance = await this.prisma.deliveryAttendance.create({
      data: {
        deliveryId,
        scheduleId,
        lat: data.lat,
        lng: data.lng,
      },
    });

    await this.prisma.deliveryDetails.update({
      where: { userId: deliveryId },
      data: { availableNow: true },
    });

    return attendance;
  }

  private getDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // metres
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
  }
}
