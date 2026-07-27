// Per-branch auto-stop cap: once maxActiveOrders orders are simultaneously
// "in the kitchen" (PENDING/PENDING_PAYMENT/PREPARING/READY_PICKUP), new
// orders are rejected at checkout until one clears. Shared by both the
// price-preview and the actual order-creation path (create() calls
// calculateOrder() internally).
import { BadRequestException } from '@nestjs/common';
import { CommissionType, OrderStatus, OrderType } from '@prisma/client';
import { ServiceModuleHelper } from '../../serviceModule/services/serviceModule.helper.service';
import { OrderService } from '../order.service';

const realServiceHelper = new ServiceModuleHelper(null as any, null as any);

const store = {
  tax: 0,
  commission: 0,
  commissionType: CommissionType.FIXED,
  minOrderAmount: null,
};

const buildHelpers = () => ({
  validateServiceAvailability: jest.fn().mockResolvedValue({ id: 1, Store: store }),
  validateSizeAndAddons: jest.fn().mockResolvedValue({ basePrice: 20, addonsPrice: 0 }),
  validateAndPriceBundles: jest.fn().mockResolvedValue([]),
  getTax: jest
    .fn()
    .mockImplementation((price: number) => Promise.resolve({ tax: 0, priceAfterTax: price })),
  getDeliveryPrice: jest.fn().mockResolvedValue(0),
});

const buildPrisma = (maxActiveOrders: number | null, activeOrdersCount: number) => ({
  branch: { findUnique: jest.fn().mockResolvedValue({ maxActiveOrders }) },
  order: { count: jest.fn().mockResolvedValue(activeOrdersCount) },
});

const buildService = (prisma: any, helpers: any) =>
  new OrderService(
    prisma as any,
    undefined as any, // languages
    helpers as any,
    undefined as any, // walletService
    undefined as any, // paymentService
    undefined as any, // transactionService
    undefined as any, // notificationService
    undefined as any, // mapService
    { getSettings: jest.fn().mockResolvedValue({ pickupEnabled: true }) } as any,
    undefined as any, // assignmentService
    realServiceHelper as any,
    undefined as any, // kashierService
    undefined as any, // zoneService
    undefined as any, // afkBreakService
    undefined as any, // logsService
  );

const baseData = {
  items: [{ serviceId: 1, quantity: 1 }],
  branchId: 9,
  addressId: 1,
  type: OrderType.DELIVERY,
} as any;

describe('OrderService.calculateOrder — maxActiveOrders (auto-stop cap)', () => {
  it('rejects a new order once the branch is at capacity', async () => {
    const prisma = buildPrisma(5, 5); // 5 active, cap 5 -> full
    const service = buildService(prisma, buildHelpers());

    await expect(service.calculateOrder(baseData)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when active count exceeds the cap too (not just equal)', async () => {
    const prisma = buildPrisma(5, 7);
    const service = buildService(prisma, buildHelpers());

    await expect(service.calculateOrder(baseData)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows a new order when under the cap', async () => {
    const prisma = buildPrisma(5, 4);
    const helpers = buildHelpers();
    const service = buildService(prisma, helpers);

    await service.calculateOrder(baseData).catch(() => undefined);

    expect(helpers.getTax).toHaveBeenCalled();
  });

  it('only counts orders still occupying kitchen capacity, not ones already handed to a driver', async () => {
    const prisma = buildPrisma(5, 3);
    const service = buildService(prisma, buildHelpers());

    await service.calculateOrder(baseData).catch(() => undefined);

    expect(prisma.order.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [
              OrderStatus.PENDING,
              OrderStatus.PENDING_PAYMENT,
              OrderStatus.PREPARING,
              OrderStatus.READY_PICKUP,
            ],
          },
        }),
      }),
    );
  });

  it('applies no cap at all when the branch never set one (null)', async () => {
    const prisma = buildPrisma(null, 9999);
    const helpers = buildHelpers();
    const service = buildService(prisma, helpers);

    await service.calculateOrder(baseData).catch(() => undefined);

    expect(prisma.order.count).not.toHaveBeenCalled();
    expect(helpers.getTax).toHaveBeenCalled();
  });
});
