// Sales analytics: all-time records (peak hour, best day, top/bottom
// product) — distinct from getStorePerformance's rolling 30-day window.
import { OrderStatus } from '@prisma/client';
import { StatisticsService } from '../statistics.service';

const buildService = (prisma: any) =>
  new StatisticsService(prisma as any, undefined as any);

describe('StatisticsService.getSalesAnalytics', () => {
  it('finds the busiest hour and the highest-revenue day', async () => {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          { date: new Date('2026-01-01T10:00:00Z'), totalPriceAfterDiscount: 100 },
          { date: new Date('2026-01-01T10:30:00Z'), totalPriceAfterDiscount: 50 },
          { date: new Date('2026-01-02T18:00:00Z'), totalPriceAfterDiscount: 10 },
        ]),
      },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      service: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = buildService(prisma);

    const result = await service.getSalesAnalytics(1);

    // 10:00/10:30 UTC on Jan 1 is 12:00/12:30 Cairo time (UTC+2 in winter, no DST).
    expect(result.peakOrderHour).toEqual({ hour: 12, orderCount: 2 });
    expect(result.bestSalesDay).toEqual({ date: '2026-01-01', revenue: 150 });
  });

  it('picks the highest-revenue product and the least-sold product (including zero-sales ones)', async () => {
    const prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          { serviceId: 1, price: 50, quantity: 2 }, // revenue 100, qty 2
          { serviceId: 2, price: 10, quantity: 1 }, // revenue 10, qty 1
        ]),
      },
      service: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: { ar: 'برجر' } },
          { id: 2, name: { ar: 'بطاطس' } },
          { id: 3, name: { ar: 'مهمل' } }, // never ordered at all
        ]),
      },
    };
    const service = buildService(prisma);

    const result = await service.getSalesAnalytics(1);

    expect(result.mostProfitableProduct).toEqual({
      serviceId: 1,
      name: { ar: 'برجر' },
      revenue: 100,
    });
    expect(result.leastSoldProduct).toEqual({
      serviceId: 3,
      name: { ar: 'مهمل' },
      quantitySold: 0,
    });
  });

  it('only counts DELIVERED order items for product revenue/quantity', async () => {
    const prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      service: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = buildService(prisma);

    await service.getSalesAnalytics(7);

    expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          Order: { status: OrderStatus.DELIVERED },
        }),
      }),
    );
  });
});
