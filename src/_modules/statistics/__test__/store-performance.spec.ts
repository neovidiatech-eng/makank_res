// Store performance dashboard: acceptance rate, cancellation rate, and
// measured average prep time (readyAt - preparingAt), over a rolling 30-day
// window. avgPrepMinutes only has data once orders actually carry both
// timestamps (stamped by changeStatus() going forward, no historical data).
import { OrderStatus } from '@prisma/client';
import { StatisticsService } from '../statistics.service';

const buildService = (prisma: any) =>
  new StatisticsService(prisma as any, undefined as any);

const groupByResult = (counts: Partial<Record<OrderStatus, number>>) =>
  Object.entries(counts).map(([status, count]) => ({
    status,
    _count: { id: count },
  }));

describe('StatisticsService.getStorePerformance (private, via cast)', () => {
  it('computes acceptance rate excluding still-undecided orders, and cancellation rate over all orders', async () => {
    const prisma = {
      order: {
        groupBy: jest.fn().mockResolvedValue(
          groupByResult({
            [OrderStatus.PENDING]: 5, // undecided, excluded from acceptance denominator
            [OrderStatus.PREPARING]: 10,
            [OrderStatus.REJECTED]: 2,
            [OrderStatus.CANCELLED]: 3,
            [OrderStatus.DELIVERED]: 20,
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = buildService(prisma);

    const result = await (service as any).getStorePerformance(1);

    // decided = 10+2+3+20 = 35, rejected = 2 -> (35-2)/35 * 100
    expect(result.acceptanceRate).toBeCloseTo(((35 - 2) / 35) * 100);
    // total = 5+10+2+3+20 = 40, cancelled = 3 -> 3/40 * 100
    expect(result.cancellationRate).toBeCloseTo((3 / 40) * 100);
    expect(result.avgPrepMinutes).toBeNull();
  });

  it('returns null rates when there are no orders at all in the window', async () => {
    const prisma = {
      order: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = buildService(prisma);

    const result = await (service as any).getStorePerformance(1);

    expect(result.acceptanceRate).toBeNull();
    expect(result.cancellationRate).toBeNull();
    expect(result.avgPrepMinutes).toBeNull();
  });

  it('averages actual prep duration only across orders with both timestamps', async () => {
    const prisma = {
      order: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([
          {
            preparingAt: new Date('2026-01-01T10:00:00Z'),
            readyAt: new Date('2026-01-01T10:10:00Z'), // 10 min
          },
          {
            preparingAt: new Date('2026-01-01T11:00:00Z'),
            readyAt: new Date('2026-01-01T11:20:00Z'), // 20 min
          },
        ]),
      },
    };
    const service = buildService(prisma);

    const result = await (service as any).getStorePerformance(1);

    expect(result.avgPrepMinutes).toBeCloseTo(15);
  });
});
