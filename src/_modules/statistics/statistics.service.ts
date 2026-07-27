import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import {
  toEgyptDateKey,
  toEgyptParts,
} from 'src/globals/helpers/egypt-time.helper';
import { PrismaService } from 'src/globals/services/prisma.service';

import { RolesKeys } from '../authorization/providers/roles';
import { LanguagesService } from '../languages/languages.service';
import { FilterStatisticsDTO } from './dto/statistics.dto';
import { FilterByFromToDate } from './prisma-args/statistics.prisma.args';

const ADMIN_PERIOD_SETTING_KEY = 'adminDashboardPeriodStartAt';

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly languages: LanguagesService,
  ) {}

  // Manual checkpoint, never a data delete — moves the lower bound of the
  // admin dashboard's "current period" summary forward to now. Historical
  // data stays fully queryable via the existing fromDate/toDate filters.
  async resetAdminPeriod() {
    const now = new Date();
    await this.prisma.settings.update({
      where: { setting: ADMIN_PERIOD_SETTING_KEY },
      data: { value: now.toISOString() },
    });
    return { periodStartedAt: now };
  }

  async resetStorePeriod(storeId: number) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store not found');

    const now = new Date();
    await this.prisma.store.update({
      where: { id: storeId },
      data: { dashboardPeriodStartAt: now },
    });
    return { periodStartedAt: now };
  }

  private async getAdminPeriodStart(): Promise<Date | undefined> {
    const setting = await this.prisma.settings.findUnique({
      where: { setting: ADMIN_PERIOD_SETTING_KEY },
    });
    if (!setting?.value) return undefined;
    const date = new Date(setting.value);
    return isNaN(date.getTime()) ? undefined : date;
  }

  private async getCurrentPeriodSummary(
    periodStartedAt: Date | undefined,
    storeId?: number,
  ) {
    const where: any = {
      ...(periodStartedAt ? { date: { gte: periodStartedAt } } : {}),
      ...(storeId ? { Branch: { storeId } } : {}),
    };
    const stats = await this.prisma.order.aggregate({
      where,
      _sum: { totalPriceAfterDiscount: true, adminCommission: true },
      _count: { id: true },
    });
    return {
      periodStartedAt: periodStartedAt ?? null,
      totalRevenue: stats._sum.totalPriceAfterDiscount || 0,
      totalCommission: stats._sum.adminCommission || 0,
      totalOrders: stats._count.id || 0,
    };
  }

  async getStatistics(filters: FilterStatisticsDTO) {
    const { fromDate, toDate } = filters;
    const totalCustomers = await this.prisma.user.count({
      where: {
        roleKey: RolesKeys.CUSTOMER,
        ...FilterByFromToDate(fromDate, toDate, 'createdAt'),
      },
    });
    const totalStores = await this.prisma.user.count({
      where: {
        roleKey: RolesKeys.STORE,
        ...FilterByFromToDate(fromDate, toDate, 'createdAt'),
      },
    });
    const totalOrders = await this.prisma.order.count({
      where: {
        ...FilterByFromToDate(fromDate, toDate, 'date'),
      },
    });
    const totalCoupons = await this.prisma.coupon.count({
      where: {
        ...FilterByFromToDate(fromDate, toDate, 'createdAt'),
      },
    });
    const groupByCustomers = await this.prisma.user.groupBy({
      by: ['createdAt'],
      where: {
        roleKey: RolesKeys.CUSTOMER,
        ...FilterByFromToDate(fromDate, toDate, 'createdAt'),
      },
      _count: {
        _all: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
    const groupByStores = await this.prisma.user.groupBy({
      by: ['createdAt'],
      where: {
        roleKey: RolesKeys.STORE,
        ...FilterByFromToDate(fromDate, toDate, 'createdAt'),
      },
      _count: {
        _all: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
    const groupByOrders = await this.prisma.order.groupBy({
      by: ['date'],
      where: {
        ...FilterByFromToDate(fromDate, toDate, 'date'),
      },
      _count: {
        _all: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    const periodStartedAt = await this.getAdminPeriodStart();
    const currentPeriod = await this.getCurrentPeriodSummary(periodStartedAt);
    const driverFinance = await this.getDriverFinanceSummary();

    return {
      totalCustomers,
      totalStores,
      totalOrders,
      totalCoupons,
      groupByCustomers,
      groupByStores,
      groupByOrders,
      currentPeriod,
      driverFinance,
    };
  }

  // At-a-glance driver-money summary for the admin dashboard: how much is waiting
  // for a withdrawal decision, and how much COD cash drivers are still holding
  // system-wide (both computed live off Details/DriverWithdraw — no separate
  // running total to keep in sync).
  private async getDriverFinanceSummary() {
    const [pendingWithdrawals, cashHeld] = await Promise.all([
      this.prisma.driverWithdraw.aggregate({
        where: { status: 'PENDING' },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.details.aggregate({
        where: { User: { roleKey: RolesKeys.DELIVERY } },
        _sum: { collectedCash: true, wallet: true },
      }),
    ]);

    return {
      pendingWithdrawalsCount: pendingWithdrawals._count.id || 0,
      pendingWithdrawalsAmount: pendingWithdrawals._sum.amount || 0,
      totalCollectedCashOutstanding: cashHeld._sum.collectedCash || 0,
      totalDriverWalletBalance: cashHeld._sum.wallet || 0,
    };
  }

  // Single reference endpoint for every platform-wide financial figure —
  // revenue, discounts given, commission (platform + store), wallet balances,
  // withdrawal requests, and cash drivers are holding. fromDate/toDate filter
  // the event-based figures (orders, withdrawal requests); wallet/cash
  // balances are always the CURRENT snapshot regardless of the date filter —
  // a "balance" has no meaningful historical value to filter by, same
  // convention as getDriverFinanceSummary above.
  async getFinancialOverview(filters: FilterStatisticsDTO) {
    const { fromDate, toDate } = filters;
    const orderDateFilter = FilterByFromToDate(fromDate, toDate, 'date');
    const withdrawDateFilter = FilterByFromToDate(
      fromDate,
      toDate,
      'createdAt',
    );

    const [
      orderAgg,
      storeWithdrawPending,
      storeWithdrawApproved,
      driverWithdrawPending,
      driverWithdrawApproved,
      walletAgg,
      driverDetailsAgg,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { ...orderDateFilter },
        _sum: {
          totalPriceAfterDiscount: true,
          discountAmount: true,
          adminCommission: true,
          storeCommission: true,
          globalCommission: true,
          shipping: true,
          tax: true,
          price: true,
        },
        _count: { id: true },
      }),
      this.prisma.withdraw.aggregate({
        where: { status: 'PENDING', ...withdrawDateFilter },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.withdraw.aggregate({
        where: { status: 'APPROVED', ...withdrawDateFilter },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.driverWithdraw.aggregate({
        where: { status: 'PENDING', ...withdrawDateFilter },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.driverWithdraw.aggregate({
        where: { status: 'APPROVED', ...withdrawDateFilter },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.wallet.aggregate({
        _sum: { currentBalance: true, totalCommissionDeducted: true },
      }),
      this.prisma.details.aggregate({
        where: { User: { roleKey: RolesKeys.DELIVERY } },
        _sum: { wallet: true, collectedCash: true, unsettledCommission: true },
      }),
    ]);

    return {
      period: { fromDate: fromDate ?? null, toDate: toDate ?? null },
      revenue: {
        totalOrders: orderAgg._count.id || 0,
        totalRevenue: orderAgg._sum.totalPriceAfterDiscount || 0,
        totalDiscountGiven: orderAgg._sum.discountAmount || 0,
        productPrice: orderAgg._sum.price || 0,
        shipping: orderAgg._sum.shipping || 0,
        tax: orderAgg._sum.tax || 0,
        globalCommission: orderAgg._sum.globalCommission || 0,
      },
      commission: {
        platformCommission: orderAgg._sum.adminCommission || 0,
        storeCommission: orderAgg._sum.storeCommission || 0,
      },
      // Current snapshot — not affected by fromDate/toDate (see method comment).
      walletBalances: {
        totalStoreWalletBalance: walletAgg._sum.currentBalance || 0,
        totalStoreCommissionDeducted:
          walletAgg._sum.totalCommissionDeducted || 0,
        totalDriverWalletBalance: driverDetailsAgg._sum.wallet || 0,
        totalDriverUnsettledCommission:
          driverDetailsAgg._sum.unsettledCommission || 0,
      },
      // Current snapshot — cash drivers are physically holding right now, awaiting handover.
      cashCollectedByDrivers: driverDetailsAgg._sum.collectedCash || 0,
      withdrawals: {
        stores: {
          pending: {
            count: storeWithdrawPending._count.id || 0,
            amount: storeWithdrawPending._sum.amount || 0,
          },
          approved: {
            count: storeWithdrawApproved._count.id || 0,
            amount: storeWithdrawApproved._sum.amount || 0,
          },
        },
        drivers: {
          pending: {
            count: driverWithdrawPending._count.id || 0,
            amount: driverWithdrawPending._sum.amount || 0,
          },
          approved: {
            count: driverWithdrawApproved._count.id || 0,
            amount: driverWithdrawApproved._sum.amount || 0,
          },
        },
      },
    };
  }

  async getStoreDashboard(storeId: number) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const getDailyStats = async (date: Date) => {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const stats = await this.prisma.order.aggregate({
        where: {
          Branch: { storeId },
          date: { gte: date, lt: nextDay },
        },
        _sum: { totalPriceAfterDiscount: true },
        _count: { id: true },
      });

      return {
        revenue: stats._sum.totalPriceAfterDiscount || 0,
        orders: stats._count.id || 0,
      };
    };

    const todayStats = await getDailyStats(today);
    const yesterdayStats = await getDailyStats(yesterday);

    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    // 7-day revenue chart
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      last7Days.push(d);
    }

    const revenueChart = await Promise.all(
      last7Days.map(async (date) => {
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const stats = await this.prisma.order.aggregate({
          where: {
            Branch: { storeId },
            date: { gte: date, lt: nextDay },
          },
          _sum: { totalPriceAfterDiscount: true },
        });
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return {
          day: days[date.getDay()],
          value: stats._sum.totalPriceAfterDiscount || 0,
        };
      }),
    );

    // Revenue Overview vs last week (simplified to total revenue vs last week's same day)
    const lastWeekSameDay = new Date(today);
    lastWeekSameDay.setDate(lastWeekSameDay.getDate() - 7);
    const lastWeekStats = await getDailyStats(lastWeekSameDay);

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { dashboardPeriodStartAt: true, rating: true, review: true },
    });
    const currentPeriod = await this.getCurrentPeriodSummary(
      store?.dashboardPeriodStartAt ?? undefined,
      storeId,
    );
    const performance = await this.getStorePerformance(storeId);

    return {
      revenueToday: {
        value: todayStats.revenue,
        changePercentage: calculateChange(
          todayStats.revenue,
          yesterdayStats.revenue,
        ),
      },
      activeOrders: {
        value: todayStats.orders,
        changePercentage: calculateChange(
          todayStats.orders,
          yesterdayStats.orders,
        ),
      },
      revenueChart,
      revenueOverview: {
        value: todayStats.revenue, // Current daily revenue for the large card
        changePercentage: calculateChange(
          todayStats.revenue,
          lastWeekStats.revenue,
        ),
      },
      currentPeriod,
      rating: store?.rating ?? 0,
      review: store?.review ?? 0,
      ...performance,
    };
  }

  // Acceptance/cancellation rate and measured prep time, over a rolling
  // 30-day window (a single day is too noisy for a "performance" signal).
  // avgPrepMinutes only counts orders that actually have both preparingAt
  // and readyAt stamped — those columns only started being written the day
  // this feature shipped, so there's no historical data to backfill; it'll
  // read as null until enough new orders flow through.
  private async getStorePerformance(storeId: number) {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 30);

    const statusCounts = await this.prisma.order.groupBy({
      by: ['status'],
      where: {
        Branch: { storeId },
        date: { gte: windowStart },
      },
      _count: { id: true },
    });

    const countOf = (status: OrderStatus) =>
      statusCounts.find((s) => s.status === status)?._count.id ?? 0;

    const undecidedCount =
      countOf(OrderStatus.PENDING) + countOf(OrderStatus.PENDING_PAYMENT);
    const totalCount = statusCounts.reduce((sum, s) => sum + s._count.id, 0);
    const decidedCount = totalCount - undecidedCount;
    const rejectedCount = countOf(OrderStatus.REJECTED);
    const cancelledCount = countOf(OrderStatus.CANCELLED);

    const acceptanceRate =
      decidedCount > 0
        ? ((decidedCount - rejectedCount) / decidedCount) * 100
        : null;
    const cancellationRate =
      totalCount > 0 ? (cancelledCount / totalCount) * 100 : null;

    const preparedOrders = await this.prisma.order.findMany({
      where: {
        Branch: { storeId },
        date: { gte: windowStart },
        preparingAt: { not: null },
        readyAt: { not: null },
      },
      select: { preparingAt: true, readyAt: true },
    });
    const avgPrepMinutes =
      preparedOrders.length > 0
        ? preparedOrders.reduce(
            (sum, o) =>
              sum +
              (o.readyAt!.getTime() - o.preparingAt!.getTime()) / 60000,
            0,
          ) / preparedOrders.length
        : null;

    return { acceptanceRate, cancellationRate, avgPrepMinutes };
  }

  // All-time historical facts (not a rolling window like getStorePerformance)
  // — "busiest hour ever" / "best day ever" are records, not a recent trend.
  async getSalesAnalytics(storeId: number) {
    const orders = await this.prisma.order.findMany({
      where: { Branch: { storeId } },
      select: { date: true, totalPriceAfterDiscount: true },
    });

    const hourCounts = new Map<number, number>();
    const dayRevenue = new Map<string, number>();
    for (const order of orders) {
      // Egypt wall-clock, not server-local/UTC — the container stays on UTC
      // (see egypt-time.helper.ts), so a naive getHours()/toISOString() would
      // report the wrong "hour of day" from a restaurant owner's perspective.
      const hour = toEgyptParts(order.date).hours;
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);

      const dayKey = toEgyptDateKey(order.date);
      dayRevenue.set(
        dayKey,
        (dayRevenue.get(dayKey) ?? 0) + order.totalPriceAfterDiscount,
      );
    }

    const peakHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const bestDay = [...dayRevenue.entries()].sort((a, b) => b[1] - a[1])[0];

    const deliveredItems = await this.prisma.orderItem.findMany({
      where: {
        Service: { storeId },
        Order: { status: OrderStatus.DELIVERED },
      },
      select: { serviceId: true, price: true, quantity: true },
    });
    const revenueByService = new Map<number, number>();
    const quantityByService = new Map<number, number>();
    for (const item of deliveredItems) {
      revenueByService.set(
        item.serviceId,
        (revenueByService.get(item.serviceId) ?? 0) + item.price * item.quantity,
      );
      quantityByService.set(
        item.serviceId,
        (quantityByService.get(item.serviceId) ?? 0) + item.quantity,
      );
    }

    const services = await this.prisma.service.findMany({
      where: { storeId, deletedAt: null },
      select: { id: true, name: true },
    });

    const topProductEntry = [...revenueByService.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];
    // Least sold considers EVERY active product, including ones with zero
    // sales (0 is a real, useful answer — "this item never sells").
    const leastSoldEntry = services
      .map((s) => ({ id: s.id, qty: quantityByService.get(s.id) ?? 0 }))
      .sort((a, b) => a.qty - b.qty)[0];

    const serviceById = new Map(services.map((s) => [s.id, s.name]));

    return {
      peakOrderHour: peakHour
        ? { hour: peakHour[0], orderCount: peakHour[1] }
        : null,
      bestSalesDay: bestDay ? { date: bestDay[0], revenue: bestDay[1] } : null,
      mostProfitableProduct: topProductEntry
        ? {
            serviceId: topProductEntry[0],
            name: serviceById.get(topProductEntry[0]) ?? null,
            revenue: topProductEntry[1],
          }
        : null,
      leastSoldProduct: leastSoldEntry
        ? {
            serviceId: leastSoldEntry.id,
            name: serviceById.get(leastSoldEntry.id) ?? null,
            quantitySold: leastSoldEntry.qty,
          }
        : null,
    };
  }

  // Rolling 30-day window, same as getStorePerformance — this is about
  // recent staff performance, not an all-time record.
  async getEmployeePerformance(storeId: number) {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 30);

    const orders = await this.prisma.order.findMany({
      where: { Branch: { storeId }, date: { gte: windowStart } },
      select: {
        acceptedByUserId: true,
        rejectedByUserId: true,
        readyMarkedByUserId: true,
        preparingAt: true,
        readyAt: true,
      },
    });

    const acceptedCount = new Map<number, number>();
    const rejectedCount = new Map<number, number>();
    const prepDurations = new Map<number, number[]>();

    for (const order of orders) {
      if (order.acceptedByUserId) {
        acceptedCount.set(
          order.acceptedByUserId,
          (acceptedCount.get(order.acceptedByUserId) ?? 0) + 1,
        );
      }
      if (order.rejectedByUserId) {
        rejectedCount.set(
          order.rejectedByUserId,
          (rejectedCount.get(order.rejectedByUserId) ?? 0) + 1,
        );
      }
      if (order.readyMarkedByUserId && order.preparingAt && order.readyAt) {
        const minutes =
          (order.readyAt.getTime() - order.preparingAt.getTime()) / 60000;
        const list = prepDurations.get(order.readyMarkedByUserId) ?? [];
        list.push(minutes);
        prepDurations.set(order.readyMarkedByUserId, list);
      }
    }

    const userIds = new Set([
      ...acceptedCount.keys(),
      ...rejectedCount.keys(),
      ...prepDurations.keys(),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    const avgPrepByUser = [...prepDurations.entries()].map(([userId, list]) => ({
      userId,
      name: nameById.get(userId) ?? null,
      avgPrepMinutes: list.reduce((a, b) => a + b, 0) / list.length,
    }));

    const topByOrders = [...acceptedCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([userId, count]) => ({
        userId,
        name: nameById.get(userId) ?? null,
        ordersAccepted: count,
      }));
    const topByRejections = [...rejectedCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([userId, count]) => ({
        userId,
        name: nameById.get(userId) ?? null,
        ordersRejected: count,
      }));
    const fastest = [...avgPrepByUser].sort(
      (a, b) => a.avgPrepMinutes - b.avgPrepMinutes,
    );

    return {
      mostOrdersAccepted: topByOrders[0] ?? null,
      fastestEmployee: fastest[0] ?? null,
      mostOrdersRejected: topByRejections[0] ?? null,
      byEmployee: topByOrders,
    };
  }
}
