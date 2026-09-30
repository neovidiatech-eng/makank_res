import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from 'src/globals/services/prisma.service';
import { UserService } from '../../user/services/user.service';
import { WalletService } from '../wallet.service';

describe('WalletService - getDriverEarningsHistory', () => {
  let service: WalletService;

  const mockPrisma = {
    order: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
    },
    details: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    driverCashSettlement: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    driverWithdraw: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const mockUserService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    jest.clearAllMocks();
  });

  const baseOrder = {
    id: 101,
    createdAt: new Date('2026-01-15T12:00:00Z'),
    totalPriceAfterDiscount: 200,
    shipping: 50,
    originalShipping: 50,
    deliveryDiscount: 0,
    adminCommission: 15,
    tax: 5,
    packagingFee: 0,
    paymentMethod: PaymentMethod.CASH,
    paidWithWallet: false,
    isPartnerStore: true,
    type: 'DELIVERY',
    invoice: null,
    Branch: {
      id: 1,
      name: 'Test Branch',
      address: 'Main St',
      Store: {
        id: 1,
        name: 'Burger Joint',
        logo: 'https://logo.png',
        isPartner: true,
      },
    },
  };

  it('Case 1: Cash order without delivery discount -> dueFromAdmin = 0', async () => {
    const order1 = { ...baseOrder, id: 101, shipping: 50, originalShipping: 50, deliveryDiscount: 0 };
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany
      .mockResolvedValueOnce([order1])
      .mockResolvedValueOnce([order1]);

    const result = await service.getDriverEarningsHistory(10);

    expect(result.orders).toHaveLength(1);
    const o = result.orders[0];
    expect(o.driverTotalEarnings).toBe(50);
    expect(o.shippingPaidByCustomer).toBe(50);
    expect(o.deliveryCashInHand).toBe(50);
    expect(o.dueFromAdmin).toBe(0);
    expect(o.deliveryDiscount).toBe(0);
    expect(o.hasDeliveryDiscount).toBe(false);
    expect(o.isPaidOnline).toBe(false);
    expect(o.totalCashCollected).toBe(200);
    expect(o.adminDebtForOrder).toBe(150); // partner store: 200 - 50 = 150
  });

  it('Case 2: Cash order WITH delivery discount -> dueFromAdmin = discount portion (20)', async () => {
    // Delivery fee is 50, client pays 30, discount is 20
    const order2 = {
      ...baseOrder,
      id: 102,
      totalPriceAfterDiscount: 180,
      shipping: 30,
      originalShipping: 50,
      deliveryDiscount: 20,
    };
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany
      .mockResolvedValueOnce([order2])
      .mockResolvedValueOnce([order2]);

    const result = await service.getDriverEarningsHistory(10);

    const o = result.orders[0];
    expect(o.driverTotalEarnings).toBe(50);
    expect(o.shippingPaidByCustomer).toBe(30);
    expect(o.deliveryCashInHand).toBe(30);
    expect(o.dueFromAdmin).toBe(20); // 50 - 30 = 20 due from admin
    expect(o.deliveryDiscount).toBe(20);
    expect(o.hasDeliveryDiscount).toBe(true);
    expect(o.isPaidOnline).toBe(false);
    expect(o.totalCashCollected).toBe(180);
    expect(o.adminDebtForOrder).toBe(150); // 180 - 30 = 150
  });

  it('Case 3: Online order without discount -> dueFromAdmin = full 50', async () => {
    const order3 = {
      ...baseOrder,
      id: 103,
      paymentMethod: PaymentMethod.CARD,
      paidWithWallet: false,
      shipping: 50,
      originalShipping: 50,
      deliveryDiscount: 0,
    };
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany
      .mockResolvedValueOnce([order3])
      .mockResolvedValueOnce([order3]);

    const result = await service.getDriverEarningsHistory(10);

    const o = result.orders[0];
    expect(o.driverTotalEarnings).toBe(50);
    expect(o.shippingPaidByCustomer).toBe(50);
    expect(o.deliveryCashInHand).toBe(0); // Paid online, 0 cash in hand
    expect(o.dueFromAdmin).toBe(50); // Admin owes full 50
    expect(o.isPaidOnline).toBe(true);
    expect(o.totalCashCollected).toBe(0);
    expect(o.adminDebtForOrder).toBe(0);
  });

  it('Case 4: Online order WITH delivery discount -> dueFromAdmin = full contractual 50', async () => {
    const order4 = {
      ...baseOrder,
      id: 104,
      paymentMethod: PaymentMethod.ONLINE,
      paidWithWallet: false,
      shipping: 30,
      originalShipping: 50,
      deliveryDiscount: 20,
    };
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany
      .mockResolvedValueOnce([order4])
      .mockResolvedValueOnce([order4]);

    const result = await service.getDriverEarningsHistory(10);

    const o = result.orders[0];
    expect(o.driverTotalEarnings).toBe(50);
    expect(o.shippingPaidByCustomer).toBe(30);
    expect(o.deliveryCashInHand).toBe(0);
    expect(o.dueFromAdmin).toBe(50); // Full fee from admin
    expect(o.deliveryDiscount).toBe(20);
    expect(o.hasDeliveryDiscount).toBe(true);
    expect(o.isPaidOnline).toBe(true);
  });

  it('Case 5: Fortune Wheel (free delivery) -> dueFromAdmin = full contractual fee', async () => {
    const order5 = {
      ...baseOrder,
      id: 105,
      shipping: 0,
      originalShipping: 45,
      deliveryDiscount: 45,
      invoice: {
        summary: {
          isFreeDeliveryFortune: true,
          originalShippingFee: 45,
        },
      },
    };
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany
      .mockResolvedValueOnce([order5])
      .mockResolvedValueOnce([order5]);

    const result = await service.getDriverEarningsHistory(10);

    const o = result.orders[0];
    expect(o.driverTotalEarnings).toBe(45);
    expect(o.shippingPaidByCustomer).toBe(0);
    expect(o.deliveryCashInHand).toBe(0);
    expect(o.dueFromAdmin).toBe(45);
    expect(o.isFreeDelivery).toBe(true);
    expect(o.deliveryDiscount).toBe(45);
  });

  it('Case 6: Non-partner store cash calculation -> adminDebt = commission + tax', async () => {
    const nonPartnerOrder = {
      ...baseOrder,
      id: 106,
      isPartnerStore: false,
      Branch: {
        ...baseOrder.Branch,
        Store: { ...baseOrder.Branch.Store, isPartner: false },
      },
      adminCommission: 15,
      tax: 5,
    };
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany
      .mockResolvedValueOnce([nonPartnerOrder])
      .mockResolvedValueOnce([nonPartnerOrder]);

    const result = await service.getDriverEarningsHistory(10);

    const o = result.orders[0];
    expect(o.isPartnerStore).toBe(false);
    expect(o.adminDebtForOrder).toBe(20); // 15 adminCommission + 5 tax
  });

  it('Case 7: Summary aggregation correctly calculates totals across all orders', async () => {
    // 3 orders:
    // 1) Cash no discount: driverTotal = 50, cashInHand = 50, dueFromAdmin = 0
    // 2) Cash with 20 discount: driverTotal = 50, cashInHand = 30, dueFromAdmin = 20, discount = 20
    // 3) Online: driverTotal = 50, cashInHand = 0, dueFromAdmin = 50
    const order1 = { ...baseOrder, id: 1, shipping: 50, originalShipping: 50, deliveryDiscount: 0 };
    const order2 = { ...baseOrder, id: 2, shipping: 30, originalShipping: 50, deliveryDiscount: 20 };
    const order3 = { ...baseOrder, id: 3, paymentMethod: PaymentMethod.CARD, shipping: 50, originalShipping: 50, deliveryDiscount: 0 };

    mockPrisma.order.count.mockResolvedValue(3);
    mockPrisma.order.findMany
      .mockResolvedValueOnce([order1, order2, order3])
      .mockResolvedValueOnce([order1, order2, order3]);

    const result = await service.getDriverEarningsHistory(10);

    expect(result.summary.totalOrdersCount).toBe(3);
    expect(result.summary.totalDriverEarnings).toBe(150); // 50 + 50 + 50
    expect(result.summary.totalCashDeliveryInHand).toBe(80); // 50 + 30 + 0
    expect(result.summary.totalDueFromAdmin).toBe(70); // 0 + 20 + 50
    expect(result.summary.totalDeliveryDiscount).toBe(20);
    expect(result.pagination.totalPages).toBe(1);
  });

  it('Case 8: Handles pagination and date filtering properly', async () => {
    mockPrisma.order.count.mockResolvedValue(45);
    mockPrisma.order.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.getDriverEarningsHistory(10, {
      page: 2,
      limit: 10,
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    });

    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          deliveryId: 10,
          status: OrderStatus.DELIVERED,
          createdAt: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-01-31'),
          },
        }),
      }),
    );
    expect(result.pagination.page).toBe(2);
    expect(result.pagination.limit).toBe(10);
    expect(result.pagination.total).toBe(45);
    expect(result.pagination.totalPages).toBe(5);
  });

  it('Case 9: Returns settlementInfo with last settlement date and details', async () => {
    const settleDate = new Date('2026-02-01T10:00:00Z');
    mockPrisma.driverCashSettlement.findFirst.mockResolvedValueOnce({
      id: 5,
      deliveryId: 10,
      amount: 1500,
      createdAt: settleDate,
    });
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.order.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.getDriverEarningsHistory(10);

    expect(result.settlementInfo).toBeDefined();
    expect(result.settlementInfo.hasSettlementHistory).toBe(true);
    expect(result.settlementInfo.lastSettledAt).toBe(settleDate.toISOString());
    expect(result.settlementInfo.lastSettledAmount).toBe(1500);
    expect(result.settlementInfo.lastSettlementType).toBe('CASH_SETTLEMENT');
    expect(result.settlementInfo.currentCycleStartDate).toBe(settleDate.toISOString());
  });

  it('Case 10: cycle: CURRENT filters orders from last settlement date onwards', async () => {
    const settleDate = new Date('2026-02-10T08:00:00Z');
    mockPrisma.driverCashSettlement.findFirst.mockResolvedValueOnce({
      id: 9,
      deliveryId: 10,
      amount: 800,
      createdAt: settleDate,
    });
    mockPrisma.order.count.mockResolvedValue(5);
    mockPrisma.order.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.getDriverEarningsHistory(10, { cycle: 'CURRENT' });

    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deliveryId: 10,
          status: OrderStatus.DELIVERED,
          createdAt: {
            gte: settleDate,
          },
        }),
      }),
    );
    expect(result.settlementInfo.activeCycle).toBe('CURRENT');
  });
});
