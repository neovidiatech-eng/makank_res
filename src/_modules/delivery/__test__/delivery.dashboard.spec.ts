// Unit tests for the Driver Management additions (findAllForDashboard +
// getDriverDashboard). The service is constructed directly with a mocked
// PrismaService, so these run with no MySQL/Redis and no Nest DI boot.
import { NotFoundException } from '@nestjs/common';
import { AssignmentStatus, OrderStatus } from '@prisma/client';
import { RolesKeys } from '../../authorization/providers/roles';
import { DeliveryService } from '../delivery.service';

type AnyFn = jest.Mock;

const buildPrisma = () => ({
  user: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
  deliveryDetails: { count: jest.fn() },
  orderDeliveryAssignment: { count: jest.fn(), groupBy: jest.fn() },
  order: { count: jest.fn(), aggregate: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
});

const buildService = (prisma: ReturnType<typeof buildPrisma>) =>
  // Only `prisma` is touched by the methods under test; the other three
  // constructor deps are irrelevant here.
  new DeliveryService(prisma as any, {} as any, {} as any, {} as any);

describe('DeliveryService — Driver Management listing', () => {
  it('maps each driver row to the card shape (avatar/verified/availability/shift)', async () => {
    const prisma = buildPrisma();
    (prisma.user.findMany as AnyFn).mockResolvedValue([
      {
        id: 12,
        name: 'Ahmed Ali',
        email: 'ahmed@x.com',
        phone: '+2010',
        image: 'uploads/a.png',
        verified: true,
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        DeliveryDetails: { forceAvailable: true, availableNow: false },
      },
      {
        id: 13,
        name: 'No Details',
        email: 'nd@x.com',
        phone: '+2011',
        image: null,
        verified: false,
        createdAt: new Date('2026-05-02T10:00:00.000Z'),
        DeliveryDetails: null, // no details row -> flags default to false
      },
    ]);
    (prisma.user.count as AnyFn).mockResolvedValue(37);
    (prisma.deliveryDetails.count as AnyFn).mockResolvedValue(5);
    (prisma.order.aggregate as AnyFn).mockResolvedValue({ _count: { id: 10 }, _sum: { shipping: 100 } });
    (prisma.order.groupBy as AnyFn).mockResolvedValue([]);
    (prisma.orderDeliveryAssignment.groupBy as AnyFn).mockResolvedValue([]);
    (prisma.order.findMany as AnyFn).mockResolvedValue([]);

    const res = await buildService(prisma).findAllForDashboard({
      page: 1,
      limit: 10,
    } as any);

    expect(res.data[0]).toMatchObject({
      id: 12,
      name: 'Ahmed Ali',
      email: 'ahmed@x.com',
      phone: '+2010',
      avatar: 'uploads/a.png',
      isVerified: true,
      isAvailable: true, // forceAvailable
      isOnShift: false, // availableNow
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
    });
    // Missing image -> null; missing DeliveryDetails -> both flags false
    expect(res.data[1]).toMatchObject({
      avatar: null,
      isVerified: false,
      isAvailable: false,
      isOnShift: false,
    });
  });

  it('computes pagination metadata and applies skip/take', async () => {
    const prisma = buildPrisma();
    (prisma.user.findMany as AnyFn).mockResolvedValue(new Array(37).fill({ id: 1, DeliveryDetails: null }));
    (prisma.user.count as AnyFn).mockResolvedValue(37);
    (prisma.deliveryDetails.count as AnyFn).mockResolvedValue(5);
    (prisma.order.aggregate as AnyFn).mockResolvedValue({ _count: { id: 10 }, _sum: { shipping: 100 } });
    (prisma.order.groupBy as AnyFn).mockResolvedValue([]);
    (prisma.orderDeliveryAssignment.groupBy as AnyFn).mockResolvedValue([]);
    (prisma.order.findMany as AnyFn).mockResolvedValue([]);

    const res = await buildService(prisma).findAllForDashboard({
      page: 2,
      limit: 10,
    } as any);

    expect(res.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 37,
      totalPages: 4, // ceil(37/10)
    });
    const findArgs = (prisma.user.findMany as AnyFn).mock.calls[0][0];
    expect(findArgs.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('builds a DELIVERY-role search filter over name/email/phone', async () => {
    const prisma = buildPrisma();
    (prisma.user.findMany as AnyFn).mockResolvedValue([]);
    (prisma.user.count as AnyFn).mockResolvedValue(0);
    (prisma.deliveryDetails.count as AnyFn).mockResolvedValue(0);
    (prisma.order.aggregate as AnyFn).mockResolvedValue({ _count: { id: 0 }, _sum: { shipping: 0 } });
    (prisma.order.groupBy as AnyFn).mockResolvedValue([]);
    (prisma.orderDeliveryAssignment.groupBy as AnyFn).mockResolvedValue([]);
    (prisma.order.findMany as AnyFn).mockResolvedValue([]);

    await buildService(prisma).findAllForDashboard({
      page: 1,
      limit: 10,
      search: 'ahmed',
    } as any);

    const where = (prisma.user.findMany as AnyFn).mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { name: { contains: 'ahmed' } },
            { email: { contains: 'ahmed' } },
            { phone: { contains: 'ahmed' } },
          ],
        },
        { roleKey: RolesKeys.DELIVERY },
      ]),
    );
  });
});

describe('DeliveryService — Driver details dashboard', () => {
  const okDriver = {
    id: 12,
    name: 'Ahmed Ali',
    email: 'ahmed@x.com',
    phone: '+2010',
    image: 'uploads/a.png',
    verified: true,
    DeliveryDetails: { forceAvailable: false, availableNow: true },
    Details: { wallet: 50, collectedCash: 100 },
  };

  const wireHappyPath = (prisma: ReturnType<typeof buildPrisma>) => {
    (prisma.user.findFirst as AnyFn).mockResolvedValue(okDriver);
    // Promise.all order: accepted count, then rejected count
    (prisma.orderDeliveryAssignment.count as AnyFn)
      .mockResolvedValueOnce(8) // accepted
      .mockResolvedValueOnce(2); // rejected
    (prisma.order.count as AnyFn).mockResolvedValue(6); // delivered
    (prisma.order.aggregate as AnyFn)
      .mockResolvedValueOnce({
        _sum: {
          totalPriceAfterDiscount: 1240.5,
          shipping: 180,
          adminCommission: 96.25,
          tip: 0,
        },
      })
      .mockResolvedValueOnce({
        _sum: {
          totalPriceAfterDiscount: 100,
        },
      });
    (prisma.order.findMany as AnyFn).mockResolvedValue([
      {
        id: 5012,
        note: 'Leave at door',
        status: OrderStatus.DELIVERED,
        createdAt: new Date('2026-06-04T14:32:00.000Z'),
        totalPriceAfterDiscount: 210.5,
        shipping: 25,
        paymentMethod: 'CASH',
        paidWithWallet: false,
        Customer: { id: 1, name: 'Mona', phone: '+2011' },
        Branch: {
          id: 2,
          name: { ar: 'فرع', en: 'Branch' },
          Store: { id: 3, name: { ar: 'متجر', en: 'Store' }, logo: 'logo.png' },
        },
        OrderItems: [
          { id: 10, quantity: 2, price: 100, Service: { id: 20, name: { ar: 'بيتزا', en: 'Pizza' } } },
        ],
      },
    ]);
  };

  it('throws NotFound when the driver does not exist', async () => {
    const prisma = buildPrisma();
    (prisma.user.findFirst as AnyFn).mockResolvedValue(null);

    await expect(
      buildService(prisma).getDriverDashboard(999, {} as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns profile, statistics, financials, acceptance and orders', async () => {
    const prisma = buildPrisma();
    wireHappyPath(prisma);

    const res = await buildService(prisma).getDriverDashboard(12, {
      date: new Date(2026, 5, 4, 9, 0, 0), // local 2026-06-04 — TZ-independent
    } as any);

    expect(res.profile).toEqual({
      id: 12,
      name: 'Ahmed Ali',
      email: 'ahmed@x.com',
      phone: '+2010',
      avatar: 'uploads/a.png',
      isVerified: true,
      isAvailable: false, // forceAvailable
      isOnShift: true, // availableNow
    });
    expect(res.statistics).toEqual({
      acceptedOrders: 8,
      rejectedOrders: 2,
      deliveredOrders: 6,
    });
    expect(res.financialSummary).toMatchObject({
      totalOrdersAmount: 1240.5,
      deliveryFees: 180,
      adminCommission: 96.25,
      tips: 0,
    });
    expect(res.acceptanceSummary).toEqual({
      acceptedOrders: 8,
      rejectedOrders: 2,
    });
    expect(res.orders[0]).toMatchObject({
      id: 5012,
      customerName: 'Mona',
      customerPhone: '+2011',
      storeName: { ar: 'متجر', en: 'Store' },
      invoiceTotal: 210.5,
      deliveryPrice: 25,
      notes: 'Leave at door',
      status: OrderStatus.DELIVERED,
      createdAt: new Date('2026-06-04T14:32:00.000Z'),
    });
  });

  it('queries the right buckets: ACCEPTED, REJECTED|TIMEOUT, DELIVERED, day-bounded', async () => {
    const prisma = buildPrisma();
    wireHappyPath(prisma);

    await buildService(prisma).getDriverDashboard(12, {
      date: new Date(2026, 5, 4, 9, 0, 0), // local 2026-06-04 — TZ-independent
    } as any);

    const acceptedWhere = (prisma.orderDeliveryAssignment.count as AnyFn).mock
      .calls[0][0].where;
    const rejectedWhere = (prisma.orderDeliveryAssignment.count as AnyFn).mock
      .calls[1][0].where;
    const deliveredWhere = (prisma.order.count as AnyFn).mock.calls[0][0].where;

    expect(acceptedWhere.deliveryId).toBe(12);
    expect(acceptedWhere.status).toBe(AssignmentStatus.ACCEPTED);
    expect(rejectedWhere.status).toEqual({
      in: [AssignmentStatus.REJECTED, AssignmentStatus.TIMEOUT],
    });
    expect(deliveredWhere.status).toBe(OrderStatus.DELIVERED);

    // Day bounds are inclusive start-of-day .. end-of-day for the given date.
    const range = acceptedWhere.assignedAt;
    expect(range.gte.getHours()).toBe(0);
    expect(range.gte.getMinutes()).toBe(0);
    expect(range.lte.getHours()).toBe(23);
    expect(range.lte.getMinutes()).toBe(59);
  });

  it('coerces null financial aggregates to 0', async () => {
    const prisma = buildPrisma();
    (prisma.user.findFirst as AnyFn).mockResolvedValue(okDriver);
    (prisma.orderDeliveryAssignment.count as AnyFn)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    (prisma.order.count as AnyFn).mockResolvedValue(0);
    (prisma.order.aggregate as AnyFn)
      .mockResolvedValueOnce({
        _sum: {
          totalPriceAfterDiscount: null,
          shipping: null,
          adminCommission: null,
          tip: null,
        },
      })
      .mockResolvedValueOnce({
        _sum: {
          totalPriceAfterDiscount: null,
        },
      });
    (prisma.order.findMany as AnyFn).mockResolvedValue([]);

    const res = await buildService(prisma).getDriverDashboard(12, {} as any);

    expect(res.financialSummary).toMatchObject({
      totalOrdersAmount: 0,
      deliveryFees: 0,
      adminCommission: 0,
      tips: 0,
    });
  });

  it('falls back to Branch.name when the order has no Store', async () => {
    const prisma = buildPrisma();
    wireHappyPath(prisma);
    (prisma.order.findMany as AnyFn).mockResolvedValue([
      {
        id: 1,
        note: null,
        status: OrderStatus.PENDING,
        createdAt: new Date('2026-06-04T10:00:00.000Z'),
        totalPriceAfterDiscount: 50,
        shipping: 10,
        Customer: null,
        Branch: { name: { ar: 'فرع', en: 'Branch' }, Store: null },
        OrderItems: [],
      },
    ]);

    const res = await buildService(prisma).getDriverDashboard(12, {} as any);

    expect(res.orders[0]).toMatchObject({
      customerName: null,
      customerPhone: null,
      storeName: { ar: 'فرع', en: 'Branch' },
      notes: null,
      productsSummary: [],
    });
  });
});
