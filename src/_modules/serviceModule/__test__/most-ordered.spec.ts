import { ServiceStatus } from '@prisma/client';
import { ServiceModuleService } from '../services/storeModule.service';

describe('ServiceModuleService — getMostOrdered', () => {
  let service: ServiceModuleService;
  let mockPrisma: any;
  let mockHelper: any;
  let mockLanguage: any;

  beforeEach(() => {
    mockPrisma = {
      orderItem: {
        groupBy: jest.fn(),
      },
      service: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      city: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockHelper = {
      mapServices: jest.fn().mockImplementation(async (services: any[]) =>
        services.map((s) => ({
          id: s.id,
          name: s.name,
          price: s.price,
          available: s.available,
          storeId: s.storeId,
          rating: s.rating ?? 0,
        })),
      ),
    };

    mockLanguage = {
      getCashedLanguages: jest.fn().mockResolvedValue([]),
    };

    service = new ServiceModuleService(
      mockPrisma,
      mockLanguage,
      mockHelper,
      undefined as any,
      undefined as any,
    );
  });

  it('queries top ordered items within rolling window and preserves ranking', async () => {
    // Top 2 items in order items: service 10 (qty 15), service 20 (qty 8)
    mockPrisma.orderItem.groupBy.mockResolvedValueOnce([
      { serviceId: 10, _sum: { quantity: 15 } },
      { serviceId: 20, _sum: { quantity: 8 } },
    ]);

    // findMany returns them in arbitrary DB order (e.g. 20 first, then 10)
    mockPrisma.service.findMany.mockResolvedValueOnce([
      { id: 20, name: 'Burger', price: 60, status: ServiceStatus.ACTIVE, available: true },
      { id: 10, name: 'Pizza', price: 100, status: ServiceStatus.ACTIVE, available: true },
    ]);

    const result = await service.getMostOrdered({ limit: 2 });

    expect(result).toHaveLength(2);
    // Order should be preserved: 10 first, then 20
    expect(result[0].id).toBe(10);
    expect(result[1].id).toBe(20);
    expect(mockPrisma.orderItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['serviceId'],
        take: 2,
        where: expect.objectContaining({
          Order: expect.objectContaining({
            createdAt: expect.any(Object),
          }),
        }),
      }),
    );
  });

  it('applies city isolation to Store when cityId is provided', async () => {
    mockPrisma.orderItem.groupBy.mockResolvedValueOnce([
      { serviceId: 5, _sum: { quantity: 12 } },
    ]);

    mockPrisma.service.findMany.mockResolvedValueOnce([
      { id: 5, name: 'Mahalla Kebab', price: 80, status: ServiceStatus.ACTIVE, available: true },
    ]);

    const result = await service.getMostOrdered({ cityId: 2, limit: 1 });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(5);

    // Verify cityId was passed in Store where clause
    const groupByCall = mockPrisma.orderItem.groupBy.mock.calls[0][0];
    expect(groupByCall.where.Service.Store.OR).toEqual([
      { cityId: 2 },
      { cityId: null },
    ]);
  });

  it('falls back to top-rated services when order count is fewer than limit', async () => {
    // Only 1 order item in rolling window
    mockPrisma.orderItem.groupBy
      .mockResolvedValueOnce([{ serviceId: 1, _sum: { quantity: 5 } }]) // 30-day window
      .mockResolvedValueOnce([]); // all-time window

    // Fallback findMany for backfilling top rated
    mockPrisma.service.findMany
      .mockResolvedValueOnce([{ id: 2 }]) // backfill candidates
      .mockResolvedValueOnce([
        // final fetch
        { id: 1, name: 'Shawarma', price: 50, status: ServiceStatus.ACTIVE, available: true },
        { id: 2, name: 'Falafel', price: 20, status: ServiceStatus.ACTIVE, available: true },
      ]);

    const result = await service.getMostOrdered({ limit: 2 });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });

  it('delegates findAll to getMostOrdered when mostSeller filter is true', async () => {
    jest.spyOn(service, 'getMostOrdered').mockResolvedValueOnce([
      { id: 99, name: 'Top Seller' } as any,
    ]);

    const result = await service.findAll({ mostSeller: true, cityId: 3 } as any);

    expect(service.getMostOrdered).toHaveBeenCalledWith({
      cityId: 3,
      limit: 10,
      customerId: undefined,
    });
    expect(result).toHaveLength(1);
  });
});
