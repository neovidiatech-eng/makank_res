// Employee performance: rolling 30-day window, attribution comes from
// Order.acceptedByUserId / rejectedByUserId / readyMarkedByUserId, stamped
// by OrderService.changeStatus for STORE-role actors.
import { StatisticsService } from '../statistics.service';

const buildService = (prisma: any) =>
  new StatisticsService(prisma as any, undefined as any);

describe('StatisticsService.getEmployeePerformance', () => {
  it('ranks employees by orders accepted, rejections, and prep speed', async () => {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            acceptedByUserId: 1,
            rejectedByUserId: null,
            readyMarkedByUserId: 1,
            preparingAt: new Date('2026-01-01T10:00:00Z'),
            readyAt: new Date('2026-01-01T10:20:00Z'), // 20 min
          },
          {
            acceptedByUserId: 1,
            rejectedByUserId: null,
            readyMarkedByUserId: 2,
            preparingAt: new Date('2026-01-01T11:00:00Z'),
            readyAt: new Date('2026-01-01T11:10:00Z'), // 10 min
          },
          {
            acceptedByUserId: 2,
            rejectedByUserId: 2,
            readyMarkedByUserId: null,
            preparingAt: null,
            readyAt: null,
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: 'Sara' },
          { id: 2, name: 'Omar' },
        ]),
      },
    };
    const service = buildService(prisma);

    const result = await service.getEmployeePerformance(1);

    expect(result.mostOrdersAccepted).toEqual({
      userId: 1,
      name: 'Sara',
      ordersAccepted: 2,
    });
    expect(result.mostOrdersRejected).toEqual({
      userId: 2,
      name: 'Omar',
      ordersRejected: 1,
    });
    // Omar's single ready-marked order (10 min) is faster than Sara's (20 min).
    expect(result.fastestEmployee).toEqual({
      userId: 2,
      name: 'Omar',
      avgPrepMinutes: 10,
    });
  });

  it('returns nulls when there is no attributed activity in the window', async () => {
    const prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = buildService(prisma);

    const result = await service.getEmployeePerformance(1);

    expect(result.mostOrdersAccepted).toBeNull();
    expect(result.fastestEmployee).toBeNull();
    expect(result.mostOrdersRejected).toBeNull();
  });
});
