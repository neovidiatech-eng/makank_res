// Per-store minimum order amount — checked on the items subtotal (before
// tax/delivery/discount), shared by both the price-preview and the actual
// order-creation path since create() calls calculateOrder() internally.
import { BadRequestException } from '@nestjs/common';
import { CommissionType, OrderType } from '@prisma/client';
import { ServiceModuleHelper } from '../../serviceModule/services/serviceModule.helper.service';
import { OrderService } from '../order.service';

const realServiceHelper = new ServiceModuleHelper(null as any, null as any);

const buildStoreWithMin = (minOrderAmount: number | null) => ({
  tax: 0,
  commission: 0,
  commissionType: CommissionType.FIXED,
  minOrderAmount,
});

const buildHelpers = (store: any) => ({
  validateServiceAvailability: jest.fn().mockResolvedValue({
    id: 1,
    Store: store,
  }),
  validateSizeAndAddons: jest.fn().mockResolvedValue({
    basePrice: 20,
    addonsPrice: 0,
  }),
  validateAndPriceBundles: jest.fn().mockResolvedValue([]),
  getTax: jest.fn().mockImplementation((price: number) =>
    Promise.resolve({ tax: 0, priceAfterTax: price }),
  ),
  getDeliveryPrice: jest.fn().mockResolvedValue(0),
});

const buildService = (helpers: any) =>
  new OrderService(
    // Only branch.findUnique/order.count are touched (the maxActiveOrders
    // cap check) — no cap set here, this file owns minOrderAmount only.
    {
      branch: { findUnique: jest.fn().mockResolvedValue({ maxActiveOrders: null }) },
      order: { count: jest.fn() },
    } as any, // prisma
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

describe('OrderService.calculateOrder — minOrderAmount', () => {
  it('rejects when the subtotal is below the store minimum', async () => {
    const helpers = buildHelpers(buildStoreWithMin(50)); // item price 20 < min 50
    const service = buildService(helpers);

    await expect(service.calculateOrder(baseData)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows the order when the subtotal meets the minimum exactly (proceeds past the check to tax)', async () => {
    const helpers = buildHelpers(buildStoreWithMin(20)); // item price 20 == min 20
    const service = buildService(helpers);

    // Not asserting full resolution here — calculateOrder does a lot after
    // this point unrelated to minOrderAmount. Proving it got past the
    // min-order guard (by reaching getTax) is exactly what this test owns.
    await service.calculateOrder(baseData).catch(() => undefined);

    expect(helpers.getTax).toHaveBeenCalled();
  });

  it('applies no minimum at all when the store never set one (null), proceeds past the check', async () => {
    const helpers = buildHelpers(buildStoreWithMin(null));
    const service = buildService(helpers);

    await service.calculateOrder(baseData).catch(() => undefined);

    expect(helpers.getTax).toHaveBeenCalled();
  });

  it('applies the minimum to PICKUP orders too, not just delivery', async () => {
    const helpers = buildHelpers(buildStoreWithMin(50));
    const service = buildService(helpers);

    await expect(
      service.calculateOrder({ ...baseData, type: OrderType.PICKUP }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
