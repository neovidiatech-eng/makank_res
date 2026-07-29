import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RateDTO } from '../dto/order.rate.dto';
import { OrderService } from '../order.service';
import { HelpersService } from '../services/helpers.service';

/**
 * Customer rating of the store and/or driver for a completed order.
 *
 * Locks in the hardened POST /order/:id/rate behavior:
 *  - Partial rating: store-only, driver-only, or both (at least one required).
 *  - Invalid targets fail loudly (400) instead of silently succeeding — driver
 *    rating with no assigned driver, store rating with no branch / parent store.
 *  - The service-rating fan-out only runs when a store rating is given (no NaN
 *    corruption when rating the driver alone).
 *  - Authorization / single-submission guard lives in HelpersService.canUserRate.
 */
describe('OrderService.rateOrder — customer rating (store + driver)', () => {
  const buildTx = () => ({
    branch: { update: jest.fn().mockResolvedValue({}) },
    store: {
      findUnique: jest.fn().mockResolvedValue({ rating: 0, review: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    storeRating: { create: jest.fn().mockResolvedValue({}) },
    orderItem: { findMany: jest.fn().mockResolvedValue([]) },
    service: { update: jest.fn().mockResolvedValue({}) },
    deliveryDetails: {
      findUnique: jest.fn().mockResolvedValue({ rating: 0, review: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    deliveryRating: { create: jest.fn().mockResolvedValue({}) },
    order: { update: jest.fn().mockResolvedValue({}) },
  });

  const buildService = (order: any, branch: any = null) => {
    const tx = buildTx();
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      branch: { findUnique: jest.fn().mockResolvedValue(branch) },
    };
    const helpers = {
      getOrderById: jest.fn().mockResolvedValue(order),
      canUserRate: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OrderService(
      prisma as any,
      null as any, // languages
      helpers as any,
      null as any, // walletService
      null as any, // paymentService
      null as any, // transactionService
      null as any, // notificationService
      null as any, // mapService
      null as any, // settingService
      null as any, // assignmentService
      null as any, // serviceHelper
      null as any, // kashierService
      null as any, // zoneService
      null as any, // afkBreakService
      null as any, // logsService
      { broadcastNewOrder: jest.fn(), broadcastOrderStatusChanged: jest.fn() } as any, // orderTrackingGateway
    );
    // Silence the fire-and-forget "best rated" recomputes (they hit prisma tables
    // not stubbed here and run detached after the transaction).
    jest
      .spyOn(service as any, 'calculateBestRatedStore')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'calculateBestRatedBranch')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'calculateBestRatedDelivery')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'calculateBestRatedService')
      .mockResolvedValue(undefined);
    return { service, prisma, tx, helpers };
  };

  const deliveredOrder = (over: Partial<any> = {}) => ({
    id: 1,
    userId: 5,
    branchId: 10,
    deliveryId: 20,
    status: OrderStatus.DELIVERED,
    ...over,
  });

  it('rates store + driver: both rating rows created, order marked rated', async () => {
    const { service, tx } = buildService(deliveredOrder(), {
      rating: 0,
      review: 0,
      storeId: 100,
    });

    await service.rateOrder(
      1,
      { storeRate: 5, deliveryRate: 4, storeComment: 'great' } as RateDTO,
      5,
    );

    expect(tx.branch.update).toHaveBeenCalledTimes(1);
    expect(tx.store.update).toHaveBeenCalledTimes(1);
    expect(tx.storeRating.create).toHaveBeenCalledTimes(1);
    expect(tx.deliveryDetails.update).toHaveBeenCalledTimes(1);
    expect(tx.deliveryRating.create).toHaveBeenCalledTimes(1);
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { rated: true },
    });
  });

  it('driver-only: no store/branch/service writes, delivery rating created', async () => {
    const { service, prisma, tx } = buildService(deliveredOrder());

    await service.rateOrder(1, { deliveryRate: 4 } as RateDTO, 5);

    expect(prisma.branch.findUnique).not.toHaveBeenCalled();
    expect(tx.branch.update).not.toHaveBeenCalled();
    expect(tx.store.update).not.toHaveBeenCalled();
    expect(tx.storeRating.create).not.toHaveBeenCalled();
    expect(tx.orderItem.findMany).not.toHaveBeenCalled();
    expect(tx.service.update).not.toHaveBeenCalled();
    expect(tx.deliveryRating.create).toHaveBeenCalledTimes(1);
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { rated: true },
    });
  });

  it('store-only: no delivery write, store rating created', async () => {
    const { service, tx } = buildService(deliveredOrder({ deliveryId: null }), {
      rating: 0,
      review: 0,
      storeId: 100,
    });

    await service.rateOrder(1, { storeRate: 5 } as RateDTO, 5);

    expect(tx.storeRating.create).toHaveBeenCalledTimes(1);
    expect(tx.deliveryDetails.update).not.toHaveBeenCalled();
    expect(tx.deliveryRating.create).not.toHaveBeenCalled();
  });

  it('driver rating with no assigned driver → 400, nothing written', async () => {
    const { service, prisma } = buildService(
      deliveredOrder({ deliveryId: null }),
    );

    await expect(
      service.rateOrder(1, { deliveryRate: 4 } as RateDTO, 5),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('store rating with no branch → 400, nothing written', async () => {
    const { service, prisma } = buildService(
      deliveredOrder({ branchId: null }),
    );

    await expect(
      service.rateOrder(1, { storeRate: 5 } as RateDTO, 5),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('store rating where branch has no parent store → 400, nothing written', async () => {
    const { service, prisma } = buildService(deliveredOrder(), {
      rating: 0,
      review: 0,
      storeId: null,
    });

    await expect(
      service.rateOrder(1, { storeRate: 5 } as RateDTO, 5),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no rating value at all → 400', async () => {
    const { service, prisma } = buildService(deliveredOrder());

    await expect(service.rateOrder(1, {} as RateDTO, 5)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('HelpersService.canUserRate — authorization & single submission', () => {
  const buildHelpers = (order: any) => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
    };
    return new HelpersService(
      prisma as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
    );
  };

  const base = {
    id: 1,
    userId: 5,
    rated: false,
    status: OrderStatus.DELIVERED,
  };

  it('passes for the owning customer on a delivered, unrated order', async () => {
    const helpers = buildHelpers({ ...base });
    await expect(helpers.canUserRate(5, 1)).resolves.toBeUndefined();
  });

  it('rejects a non-owner', async () => {
    const helpers = buildHelpers({ ...base, userId: 5 });
    await expect(helpers.canUserRate(999, 1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an order that is not delivered', async () => {
    const helpers = buildHelpers({ ...base, status: OrderStatus.PENDING });
    await expect(helpers.canUserRate(5, 1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an already-rated order (single submission)', async () => {
    const helpers = buildHelpers({ ...base, rated: true });
    await expect(helpers.canUserRate(5, 1)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('OrderService.buildRatingEligibility — server-authoritative flags', () => {
  const bareService = () =>
    new OrderService(
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any, // orderTrackingGateway
    );

  const eligibility = (order: any) =>
    (bareService() as any).buildRatingEligibility(order);

  const delivered = (over: Partial<any> = {}) => ({
    status: OrderStatus.DELIVERED,
    rated: false,
    branchId: 10,
    deliveryId: 20,
    Branch: { storeId: 100 },
    ...over,
  });

  it('delivered, unrated, branch+store+driver → everything ratable', () => {
    expect(eligibility(delivered())).toEqual({
      canRateStore: true,
      canRateDriver: true,
      canSubmitRating: true,
      alreadyRated: false,
    });
  });

  it('no driver → store only', () => {
    expect(eligibility(delivered({ deliveryId: null }))).toMatchObject({
      canRateStore: true,
      canRateDriver: false,
      canSubmitRating: true,
    });
  });

  it('no branch → driver only', () => {
    expect(
      eligibility(delivered({ branchId: null, Branch: null })),
    ).toMatchObject({
      canRateStore: false,
      canRateDriver: true,
      canSubmitRating: true,
    });
  });

  it('branch without a parent store → store not ratable', () => {
    expect(eligibility(delivered({ Branch: { storeId: null } }))).toMatchObject(
      {
        canRateStore: false,
        canRateDriver: true,
      },
    );
  });

  it('not delivered → nothing ratable', () => {
    expect(eligibility(delivered({ status: OrderStatus.ON_THE_WAY }))).toEqual({
      canRateStore: false,
      canRateDriver: false,
      canSubmitRating: false,
      alreadyRated: false,
    });
  });

  it('already rated → nothing ratable, alreadyRated true', () => {
    expect(eligibility(delivered({ rated: true }))).toEqual({
      canRateStore: false,
      canRateDriver: false,
      canSubmitRating: false,
      alreadyRated: true,
    });
  });
});

describe('RateDTO — validation', () => {
  const validateDto = (payload: object) =>
    validate(plainToInstance(RateDTO, payload));

  it('accepts a 1–5 rating', async () => {
    expect(await validateDto({ deliveryRate: 5 })).toHaveLength(0);
    expect(await validateDto({ storeRate: 1, deliveryRate: 3 })).toHaveLength(
      0,
    );
  });

  it('rejects a rating above 5', async () => {
    const errors = await validateDto({ storeRate: 6 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a rating below 1', async () => {
    const errors = await validateDto({ deliveryRate: 0 });
    expect(errors.length).toBeGreaterThan(0);
  });
});
