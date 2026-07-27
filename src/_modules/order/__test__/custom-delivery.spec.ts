// Unit tests for the custom-delivery (multi-station errand) feature.
// No MySQL/Redis/Nest DI — DTO validation, the select-object shape, the pricing
// summation and the station state-machine (advance/finish) are exercised with a
// mocked Prisma and stubbed collaborators only.

import {
  OrderStatus,
  OrderType,
  PaymentMethod,
  StationStatus,
  StationType,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RolesKeys } from '../../authorization/providers/roles';
import {
  CalculateCustomDeliveryOrderDTO,
  CreateCustomDeliveryOrderDTO,
  UploadStationImagesDTO,
} from '../dto/custom-delivery-order.dto';
import { FilterOrderDTO } from '../dto/order.dto';
import { OrderService } from '../order.service';
import { selectOrderOBJ } from '../prisma-args/order.prisma.args';

// ---------------------------------------------------------------------------
// Service construction — only the deps a method touches need to be real.
// ---------------------------------------------------------------------------

type Deps = Partial<{
  prisma: any;
  helpers: any;
  notificationService: any;
  settingService: any;
  serviceHelper: any;
  walletService: any;
  assignmentService: any;
  zoneService: any;
}>;

const buildService = (d: Deps = {}): OrderService =>
  new OrderService(
    d.prisma as any, // prisma
    undefined as any, // languages
    (d.helpers ? {
      consumeFortuneReward: jest.fn(),
      getCustomDeliveryCommission: jest.fn().mockResolvedValue(0),
      getCustomDeliveryPrice: jest.fn().mockResolvedValue(30),
      verifyCustomDeliveryReward: jest.fn().mockResolvedValue({ rewardId: 12 }),
      ...d.helpers
    } : {
      consumeFortuneReward: jest.fn(),
      getCustomDeliveryCommission: jest.fn().mockResolvedValue(0),
      getCustomDeliveryPrice: jest.fn().mockResolvedValue(30),
      verifyCustomDeliveryReward: jest.fn().mockResolvedValue({ rewardId: 12 }),
    }) as any, // helpers
    d.walletService as any, // walletService
    undefined as any, // paymentService
    undefined as any, // transactionService
    (d.notificationService ?? { sendLocalizedNotification: jest.fn() }) as any, // notificationService
    undefined as any, // mapService
    (d.settingService ?? {
      getSettings: jest.fn().mockResolvedValue({
        customDeliveryEnabled: true,
        onlineDeliveryEnabled: true,
      }),
    }) as any, // settingService
    d.assignmentService as any, // assignmentService
    d.serviceHelper as any, // serviceHelper
    undefined as any, // kashierService
    (d.zoneService ?? {
      firstPointOutsideActiveZones: jest.fn().mockResolvedValue(-1),
      resolveZoneId: jest.fn().mockResolvedValue(null),
    }) as any, // zoneService
    undefined as any, // afkBreakService
    undefined as any, // logsService
  );

const buildPrisma = (order: any) => {
  const tx = {
    orderStation: { update: jest.fn() },
    order: { update: jest.fn() },
  };
  return {
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue(order),
    },
    orderStation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    __tx: tx,
  };
};

const station = (
  sequence: number,
  status: StationStatus,
  extra: Record<string, any> = {},
) => ({
  id: sequence * 10,
  sequence,
  status,
  type: extra.type ?? StationType.PICKUP,
  estimatedCost: 0,
  ...extra,
});

const driver = (id = 7) =>
  ({ id, Role: { roleKey: RolesKeys.DELIVERY } }) as any;

const customOrder = (stations: any[], over: Record<string, any> = {}) => ({
  id: 100,
  userId: 5,
  deliveryId: 7,
  type: OrderType.CUSTOM_DELIVERY,
  status: OrderStatus.ON_THE_WAY,
  Stations: stations,
  ...over,
});

// ---------------------------------------------------------------------------
// DTO validation
// ---------------------------------------------------------------------------

const validStops = () => [
  {
    zoneId: 1,
    lat: 24.7,
    lng: 46.6,
    name: 'ورشة',
    purchaseList: 'مفك',
    estimatedCost: 50,
  },
  { zoneId: 2, lat: 24.8, lng: 46.7, name: 'البيت', notes: 'اتصل عند الوصول' },
];

describe('CustomDelivery DTO validation', () => {
  it('rejects fewer than 2 stops', async () => {
    const dto = plainToInstance(CalculateCustomDeliveryOrderDTO, {
      stops: [{ lat: 24.7, lng: 46.6 }],
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('stops');
  });

  it('accepts enriched per-station fields', async () => {
    const dto = plainToInstance(CalculateCustomDeliveryOrderDTO, {
      stops: validStops(),
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a numeric fortuneRewardId', async () => {
    const dto = plainToInstance(CalculateCustomDeliveryOrderDTO, {
      stops: validStops(),
      fortuneRewardId: '12',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.fortuneRewardId).toBe(12);
  });

  it('rejects a non-number fortuneRewardId', async () => {
    const dto = plainToInstance(CalculateCustomDeliveryOrderDTO, {
      stops: validStops(),
      fortuneRewardId: 'free-shipping',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('fortuneRewardId');
  });

  it('rejects couponCode under the request whitelist', async () => {
    const dto = plainToInstance(CalculateCustomDeliveryOrderDTO, {
      stops: validStops(),
      couponCode: 'FREE50',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.some((e) => e.property === 'couponCode')).toBe(true);
  });

  it('rejects a negative per-station estimatedCost', () => {
    // @ValidateNumber({ allowNegative: false }) guards at transform time.
    expect(() =>
      plainToInstance(CalculateCustomDeliveryOrderDTO, {
        stops: [
          { lat: 24.7, lng: 46.6, estimatedCost: -5 },
          { lat: 24.8, lng: 46.7 },
        ],
      }),
    ).toThrow(/Negative numbers are not allowed/i);
  });

  it('requires paymentMethod on create', async () => {
    const dto = plainToInstance(CreateCustomDeliveryOrderDTO, {
      stops: validStops(),
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('paymentMethod');
  });

  it('accepts a valid create payload', async () => {
    const dto = plainToInstance(CreateCustomDeliveryOrderDTO, {
      stops: validStops(),
      paymentMethod: PaymentMethod.CASH,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a stop with an imageIds array', async () => {
    const dto = plainToInstance(CalculateCustomDeliveryOrderDTO, {
      stops: [
        { zoneId: 1, lat: 24.7, lng: 46.6, imageIds: [12, 13] },
        { zoneId: 2, lat: 24.8, lng: 46.7 },
      ],
    });
    const errors = await validate(dto, { whitelist: false });
    expect(errors).toHaveLength(0);
  });

  it('accepts a stop with no imageIds', async () => {
    const dto = plainToInstance(CalculateCustomDeliveryOrderDTO, {
      stops: validStops(),
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects more than 5 imageIds on a station', async () => {
    const dto = plainToInstance(CalculateCustomDeliveryOrderDTO, {
      stops: [
        { lat: 24.7, lng: 46.6, imageIds: [1, 2, 3, 4, 5, 6] },
        { lat: 24.8, lng: 46.7 },
      ],
    });
    const errors = await validate(dto);
    // nested validation surfaces under the parent `stops` property
    expect(errors.map((e) => e.property)).toContain('stops');
  });

  it('rejects non-integer imageIds', async () => {
    const dto = plainToInstance(CalculateCustomDeliveryOrderDTO, {
      stops: [
        { lat: 24.7, lng: 46.6, imageIds: ['a', 'b'] },
        { lat: 24.8, lng: 46.7 },
      ],
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('stops');
  });
});

// ---------------------------------------------------------------------------
// selectOrderOBJ exposes stations + custom fields
// ---------------------------------------------------------------------------

describe('selectOrderOBJ — custom delivery exposure', () => {
  it('includes ordered Stations and the custom-delivery fields', () => {
    const select = selectOrderOBJ({} as FilterOrderDTO) as any;
    expect(select).toHaveProperty('itemsDescription', true);
    expect(select).toHaveProperty('estimatedItemsCost', true);
    expect(select).toHaveProperty('driverInstructions', true);
    expect(select).toHaveProperty('pickupLat', true);
    expect(select.Stations.orderBy).toEqual({ sequence: 'asc' });
  });

  it('includes per-station Images ordered by id', () => {
    const select = selectOrderOBJ({} as FilterOrderDTO) as any;
    expect(select.Stations.include.Images).toBeDefined();
    expect(select.Stations.include.Images.select).toEqual({
      id: true,
      image: true,
    });
    expect(select.Stations.include.Images.orderBy).toEqual({ id: 'asc' });
  });
});

// ---------------------------------------------------------------------------
// Pricing — items cost is summed from per-station estimates
// ---------------------------------------------------------------------------

describe('calculateCustomDeliveryOrder — pricing', () => {
  const pricingService = (helperOverrides: Record<string, any> = {}) =>
    buildService({
      helpers: {
        getCustomDeliveryPrice: jest.fn().mockResolvedValue(30),
        verifyCustomDeliveryReward: jest
          .fn()
          .mockResolvedValue({ rewardId: 12 }),
        ...helperOverrides,
      },
      serviceHelper: {
        getGlobalCommissionSettings: jest.fn().mockResolvedValue({}),
        calculateGlobalCommission: jest.fn().mockReturnValue(0),
      },
      settingService: {
        getSettings: jest
          .fn()
          .mockResolvedValue({ customDeliveryExtraStopPrice: 5 }),
      },
    });

  it('sums per-station estimatedCost and charges an extra-stop fee beyond two stops', async () => {
    const result = await pricingService().calculateCustomDeliveryOrder({
      stops: [
        { lat: 1, lng: 1, estimatedCost: 50 },
        { lat: 2, lng: 2, estimatedCost: 30 },
        { lat: 3, lng: 3, estimatedCost: 0 },
      ],
    } as any);

    expect(result.estimatedItemsCost).toBe(80); // 50 + 30 + 0
    expect(result.extraStopFee).toBe(5); // (3 - 2) * 5
    // Extra-stop fee is the driver's money (folded into shipping), not admin
    // revenue — adminCommission is globalCommission only.
    expect(result.shipping).toBe(35); // 30 base + 5 extra-stop fee
    expect(result.adminCommission).toBe(0);
    expect(result.total).toBe(115); // 80 items + 0 admin + 35 shipping
  });

  it('falls back to order-level estimatedItemsCost when stations carry no cost', async () => {
    const result = await pricingService().calculateCustomDeliveryOrder({
      stops: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
      estimatedItemsCost: 200,
    } as any);

    expect(result.estimatedItemsCost).toBe(200);
    expect(result.extraStopFee).toBe(0);
  });

  it('applies a free-delivery reward without changing tip, items cost, or commission', async () => {
    const helpers = {
      getCustomDeliveryPrice: jest.fn().mockResolvedValue(30),
      verifyCustomDeliveryReward: jest.fn().mockResolvedValue({ rewardId: 12 }),
    };
    const service = pricingService(helpers);

    const result = await service.calculateCustomDeliveryOrder({
      stops: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
      estimatedItemsCost: 100,
      tip: 10,
      userId: 5,
      fortuneRewardId: 12,
    } as any);

    expect(helpers.verifyCustomDeliveryReward).toHaveBeenCalledWith(
      12,
      5,
      100,
      30,
    );
    expect(result.estimatedItemsCost).toBe(100);
    expect(result.adminCommission).toBe(0);
    expect(result.shipping).toBe(0);
    expect(result.deliveryDiscount).toBe(30);
    expect(result.freeDelivery).toBe(true);
    expect(result.rewardId).toBe(12);
    expect(result.total).toBe(110); // 100 items + 0 commission + 0 shipping + 10 tip
  });

  it('a free-delivery reward discounts only the base fee — the driver still earns the extra-stop fee', async () => {
    const helpers = {
      getCustomDeliveryPrice: jest.fn().mockResolvedValue(30),
      verifyCustomDeliveryReward: jest.fn().mockResolvedValue({ rewardId: 12 }),
    };
    const service = pricingService(helpers);

    const result = await service.calculateCustomDeliveryOrder({
      stops: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
        { lat: 3, lng: 3 }, // 1 extra stop beyond the first two
      ],
      estimatedItemsCost: 100,
      userId: 5,
      fortuneRewardId: 12,
    } as any);

    expect(result.extraStopFee).toBe(5);
    expect(result.deliveryDiscount).toBe(30); // only the base fee was discounted
    expect(result.shipping).toBe(5); // 0 (free base) + 5 extra-stop fee, still owed to the driver
    expect(result.adminCommission).toBe(0);
    expect(result.total).toBe(105); // 100 items + 0 admin + 5 shipping
  });

  it('rejects a reward in preview when no authenticated user is present', async () => {
    const service = pricingService();

    await expect(
      service.calculateCustomDeliveryOrder({
        stops: validStops(),
        estimatedItemsCost: 100,
        fortuneRewardId: 12,
      } as any),
    ).rejects.toThrow('Login required to apply a reward');
  });

  it.each([
    [
      'discount reward',
      'Only free-delivery rewards can be used with custom delivery orders',
    ],
    [
      'fixed amount reward',
      'Only free-delivery rewards can be used with custom delivery orders',
    ],
    ['custom reward', 'This reward type cannot be redeemed at checkout'],
    ['none reward', 'This reward type cannot be redeemed at checkout'],
    ['not-owned reward', 'Reward does not belong to you'],
    ['expired reward', 'Reward has expired'],
    ['already-used reward', 'Reward has already been used'],
    [
      'zero-shipping route',
      'This reward cannot be applied: order has no delivery fee',
    ],
  ])(
    'rejects %s through the custom-delivery reward validator',
    async (_caseName, message) => {
      const helpers = {
        getCustomDeliveryPrice: jest.fn().mockResolvedValue(30),
        verifyCustomDeliveryReward: jest
          .fn()
          .mockRejectedValue(new Error(message)),
      };
      const service = pricingService(helpers);

      await expect(
        service.calculateCustomDeliveryOrder({
          stops: validStops(),
          estimatedItemsCost: 100,
          userId: 5,
          fortuneRewardId: 12,
        } as any),
      ).rejects.toThrow(message);
    },
  );
});

// ---------------------------------------------------------------------------
// Station state machine — advance ("Move to next location")
// ---------------------------------------------------------------------------

describe('advanceCustomDeliveryStation', () => {
  it('completes the active station and moves the next one to GOING', async () => {
    const order = customOrder([
      station(1, StationStatus.GOING),
      station(2, StationStatus.WAITING),
      station(3, StationStatus.WAITING),
    ]);
    const prisma = buildPrisma(order);
    const notificationService = { sendLocalizedNotification: jest.fn() };
    const service = buildService({ prisma, notificationService });

    const res = await service.advanceCustomDeliveryStation(
      100,
      driver(),
      24.7,
      46.6,
    );

    expect(res.currentStep).toBe(2);
    expect(res.totalSteps).toBe(3);
    expect(res.finished).toBe(false);
    // station 1 -> REACHED, station 2 -> GOING
    expect(prisma.__tx.orderStation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: StationStatus.REACHED }),
      }),
    );
    expect(prisma.__tx.orderStation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: StationStatus.GOING } }),
    );
    expect(notificationService.sendLocalizedNotification).toHaveBeenCalledTimes(
      1,
    );
  });

  it('rejects advancing the final station (must use finish)', async () => {
    const order = customOrder([
      station(1, StationStatus.REACHED),
      station(2, StationStatus.REACHED),
      station(3, StationStatus.GOING),
    ]);
    const service = buildService({ prisma: buildPrisma(order) });

    await expect(
      service.advanceCustomDeliveryStation(100, driver(), 24.7, 46.6),
    ).rejects.toThrow(/finish/i);
  });

  it('rejects when there is no active station', async () => {
    const order = customOrder([
      station(1, StationStatus.REACHED),
      station(2, StationStatus.REACHED),
    ]);
    const service = buildService({ prisma: buildPrisma(order) });

    await expect(
      service.advanceCustomDeliveryStation(100, driver(), 24.7, 46.6),
    ).rejects.toThrow(/no active station/i);
  });

  it('forbids a non-assigned driver', async () => {
    const order = customOrder([
      station(1, StationStatus.GOING),
      station(2, StationStatus.WAITING),
    ]);
    const service = buildService({ prisma: buildPrisma(order) });

    await expect(
      service.advanceCustomDeliveryStation(100, driver(999), 24.7, 46.6),
    ).rejects.toThrow(/assigned driver/i);
  });

  it('rejects when the order is not in progress', async () => {
    const order = customOrder(
      [station(1, StationStatus.WAITING), station(2, StationStatus.WAITING)],
      { status: OrderStatus.READY_PICKUP },
    );
    const service = buildService({ prisma: buildPrisma(order) });

    await expect(
      service.advanceCustomDeliveryStation(100, driver(), 24.7, 46.6),
    ).rejects.toThrow(/not in progress/i);
  });
});

// ---------------------------------------------------------------------------
// Station state machine — finish ("Finish Task")
// ---------------------------------------------------------------------------

describe('finishCustomDelivery', () => {
  it('blocks finishing while an earlier station is unreached', async () => {
    const order = customOrder([
      station(1, StationStatus.REACHED),
      station(2, StationStatus.GOING), // not reached yet
      station(3, StationStatus.GOING),
    ]);
    const service = buildService({ prisma: buildPrisma(order) });

    await expect(
      service.finishCustomDelivery(100, driver(), 24.7, 46.6),
    ).rejects.toThrow(/before completing all stations/i);
  });

  it('does NOT mark the last station reached when the DELIVERED transition fails', async () => {
    // e.g. driver finishes without lat/lng — changeStatus rejects. The station
    // must not be left REACHED on an order that never got delivered.
    const order = customOrder([
      station(1, StationStatus.REACHED),
      station(2, StationStatus.REACHED),
      station(3, StationStatus.GOING),
    ]);
    const prisma = buildPrisma(order);
    const service = buildService({ prisma });
    jest
      .spyOn(service, 'changeStatus')
      .mockRejectedValue(
        new Error('Location coordinates are required to deliver the order'),
      );

    await expect(
      service.finishCustomDelivery(100, driver(), 24.7, 46.6),
    ).rejects.toThrow(/Location/i);
    expect(prisma.orderStation.update).not.toHaveBeenCalled();
  });

  it('marks the last station reached and runs the DELIVERED transition', async () => {
    const order = customOrder([
      station(1, StationStatus.REACHED),
      station(2, StationStatus.REACHED),
      station(3, StationStatus.GOING),
    ]);
    const prisma = buildPrisma(order);
    const service = buildService({ prisma });
    const changeStatus = jest
      .spyOn(service, 'changeStatus')
      .mockResolvedValue(undefined as any);

    const res = await service.finishCustomDelivery(100, driver(), 24.9, 46.9);

    expect(prisma.orderStation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: StationStatus.REACHED }),
      }),
    );
    expect(changeStatus).toHaveBeenCalledWith(
      100,
      OrderStatus.DELIVERED,
      expect.anything(),
      24.9,
      46.9,
    );
    expect(res).toEqual({ success: true, finished: true });
  });
});

// ---------------------------------------------------------------------------
// Station images — upload records
// ---------------------------------------------------------------------------

describe('createStationImageUploads', () => {
  const buildUploadPrisma = () => {
    let n = 0;
    return {
      orderStationImage: { create: jest.fn(() => ({ id: ++n })) },
      // array form of $transaction: the array is already the (mocked) results
      $transaction: jest.fn(async (arg: any) => arg),
    };
  };

  it('creates one unconsumed row per path owned by the caller and returns the ids', async () => {
    const prisma = buildUploadPrisma();
    const service = buildService({ prisma });

    const ids = await service.createStationImageUploads(5, [
      'uploads/orders/a.jpg',
      'uploads/orders/b.jpg',
    ]);

    expect(ids).toEqual([1, 2]);
    expect(prisma.orderStationImage.create).toHaveBeenCalledTimes(2);
    expect(prisma.orderStationImage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: 5, image: 'uploads/orders/a.jpg' },
      }),
    );
  });

  it('rejects when no images are provided', async () => {
    const service = buildService({ prisma: buildUploadPrisma() });
    await expect(service.createStationImageUploads(5, [])).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Station images — consume (attach to the right station, ownership, single-use)
// ---------------------------------------------------------------------------

describe('consumeStationImages', () => {
  // updateMany echoes a count equal to the matched ids → simulates all ids
  // valid, owned and unconsumed unless overridden.
  const txAllValid = () => ({
    orderStationImage: {
      updateMany: jest.fn(async ({ where }: any) => ({
        count: where.id.in.length,
      })),
    },
  });

  const consume = (
    service: OrderService,
    tx: any,
    stops: any[],
    stations: any[],
    userId = 5,
  ) => (service as any).consumeStationImages(tx, userId, stops, stations);

  it("attaches each stop's images to the station with matching sequence", async () => {
    const tx = txAllValid();
    await consume(
      buildService(),
      tx,
      [{ imageIds: [1, 2] }, { imageIds: [3] }],
      [
        { id: 100, sequence: 1 },
        { id: 200, sequence: 2 },
      ],
    );

    expect(tx.orderStationImage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] }, userId: 5, stationId: null },
      data: { stationId: 100 },
    });
    expect(tx.orderStationImage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [3] }, userId: 5, stationId: null },
      data: { stationId: 200 },
    });
  });

  it('maps by sequence, not array position (stations returned out of order)', async () => {
    const tx = txAllValid();
    await consume(
      buildService(),
      tx,
      [{ imageIds: [1] }, { imageIds: [2] }],
      [
        { id: 200, sequence: 2 },
        { id: 100, sequence: 1 },
      ], // reversed
    );

    // stop #1 (idx 0 → sequence 1) → station 100; stop #2 → station 200
    expect(tx.orderStationImage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [1] } }),
        data: { stationId: 100 },
      }),
    );
    expect(tx.orderStationImage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [2] } }),
        data: { stationId: 200 },
      }),
    );
  });

  it('is a no-op when no stop has imageIds', async () => {
    const tx = txAllValid();
    await consume(
      buildService(),
      tx,
      [{}, {}],
      [
        { id: 100, sequence: 1 },
        { id: 200, sequence: 2 },
      ],
    );
    expect(tx.orderStationImage.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an id that is foreign / missing / already consumed (short count)', async () => {
    const tx = {
      orderStationImage: { updateMany: jest.fn(async () => ({ count: 0 })) },
    };
    await expect(
      consume(
        buildService(),
        tx,
        [{ imageIds: [1] }],
        [{ id: 100, sequence: 1 }],
      ),
    ).rejects.toThrow();
  });

  it('rejects the same id used in two stops (duplicate) before touching the db', async () => {
    const tx = txAllValid();
    await expect(
      consume(
        buildService(),
        tx,
        [{ imageIds: [1] }, { imageIds: [1] }],
        [
          { id: 100, sequence: 1 },
          { id: 200, sequence: 2 },
        ],
      ),
    ).rejects.toThrow();
    expect(tx.orderStationImage.updateMany).not.toHaveBeenCalled();
  });

  it('rejects more than 20 images across the whole order', async () => {
    const tx = txAllValid();
    // 5 stops × 5 distinct ids = 25 (>20), each stop within the per-station cap
    const stops = Array.from({ length: 5 }, (_, i) => ({
      imageIds: [1, 2, 3, 4, 5].map((n) => i * 5 + n),
    }));
    const stations = stops.map((_, i) => ({
      id: (i + 1) * 100,
      sequence: i + 1,
    }));

    await expect(
      consume(buildService(), tx, stops, stations),
    ).rejects.toThrow();
    expect(tx.orderStationImage.updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UploadStationImagesDTO — multipart upload validation (fix #1 / #2)
// ---------------------------------------------------------------------------

describe('UploadStationImagesDTO validation', () => {
  const KEY = env('INTERCEPTOR_KEY'); // '#INTERCEPTOR#' in jest.setup

  it('accepts multiple uploaded image paths and strips the interceptor marker', () => {
    const dto = plainToInstance(UploadStationImagesDTO, {
      images: [`uploads/orders/a.jpg${KEY}`, `uploads/orders/b.jpg${KEY}`],
    });
    // the broken ValidateImageArray would have thrown here; the inline Transform
    // returns a clean array
    expect(dto.images).toEqual([
      'uploads/orders/a.jpg',
      'uploads/orders/b.jpg',
    ]);
  });

  it('passes validation with a non-empty image array', async () => {
    const dto = plainToInstance(UploadStationImagesDTO, {
      images: [`uploads/orders/a.jpg${KEY}`],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty upload (no files)', async () => {
    const dto = plainToInstance(UploadStationImagesDTO, { images: undefined });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('images');
  });

  it('rejects an injected userId under the whitelist — why @AttachUserId was removed', async () => {
    // The endpoint relies on @CurrentUser(), not @AttachUserId(): if userId were
    // injected into the body, forbidNonWhitelisted would reject the request since
    // the DTO has no userId field. This proves that rejection.
    const dto = plainToInstance(UploadStationImagesDTO, {
      images: [`uploads/orders/a.jpg${KEY}`],
      userId: 5,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.some((e) => e.property === 'userId')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createCustomDeliveryOrder — image attachment + response shape (fix #3)
// ---------------------------------------------------------------------------

describe('createCustomDeliveryOrder — image attachment & response shape', () => {
  const buildCreatePrisma = (tx: any) => ({
    order: {
      findFirst: jest.fn().mockResolvedValue(null), // no idempotent hit
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  });

  const stubbedService = (
    prisma: any,
    calcOverrides: Record<string, any> = {},
    helperOverrides: Record<string, any> = {},
  ) => {
    const service = buildService({
      prisma,
      helpers: {
        consumeFortuneReward: jest.fn(),
        ...helperOverrides,
      },
      settingService: {
        getSettings: jest.fn().mockResolvedValue({ customDeliveryEnabled: true }),
      },
      zoneService: {
        // all stops covered — the coverage gate passes
        firstPointOutsideActiveZones: jest.fn().mockResolvedValue(-1),
        resolveZoneId: jest.fn().mockResolvedValue(null),
      },
      assignmentService: { handleOrderAssignment: jest.fn() },
    });
    jest.spyOn(service, 'calculateCustomDeliveryOrder').mockResolvedValue({
      estimatedItemsCost: 0,
      globalCommission: 0,
      extraStopFee: 0,
      adminCommission: 0,
      shipping: 30,
      total: 30,
      freeDelivery: false,
      deliveryDiscount: 0,
      ...calcOverrides,
    } as any);
    return service;
  };

  it('attaches imageIds to the right station (by sequence) and returns an order with no Stations', async () => {
    const tx = {
      order: { create: jest.fn().mockResolvedValue({ id: 100 }) },
      orderStation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1000, sequence: 1 },
          { id: 2000, sequence: 2 },
        ]),
      },
      orderStationImage: {
        updateMany: jest.fn(async ({ where }: any) => ({
          count: where.id.in.length,
        })),
      },
    };
    const prisma = buildCreatePrisma(tx);
    const service = stubbedService(prisma);

    const result = await service.createCustomDeliveryOrder({
      stops: [
        { lat: 24.7, lng: 46.6, imageIds: [1] },
        { lat: 24.8, lng: 46.7, imageIds: [2] },
      ],
      paymentMethod: PaymentMethod.CASH,
      userId: 5,
    } as any);

    expect(tx.orderStation.findMany).toHaveBeenCalledWith({
      where: { orderId: 100 },
      select: { id: true, sequence: true },
    });
    expect(tx.orderStationImage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1] }, userId: 5, stationId: null },
      data: { stationId: 1000 },
    });
    expect(tx.orderStationImage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [2] }, userId: 5, stationId: null },
      data: { stationId: 2000 },
    });

    // response shape: no partial Stations leaked, and create was not told to include them
    expect(result).not.toHaveProperty('Stations');
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ include: expect.anything() }),
    );
  });

  it('skips the station lookup entirely when no stop carries images', async () => {
    const tx = {
      order: { create: jest.fn().mockResolvedValue({ id: 101 }) },
      orderStation: { findMany: jest.fn() },
      orderStationImage: { updateMany: jest.fn() },
    };
    const prisma = buildCreatePrisma(tx);
    const service = stubbedService(prisma);

    const result = await service.createCustomDeliveryOrder({
      stops: [
        { lat: 24.7, lng: 46.6 },
        { lat: 24.8, lng: 46.7 },
      ],
      paymentMethod: PaymentMethod.CASH,
      userId: 5,
    } as any);

    expect(tx.orderStation.findMany).not.toHaveBeenCalled();
    expect(tx.orderStationImage.updateMany).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('Stations');
  });

  it('persists a free-delivery reward order with zero shipping and consumes the reward after create', async () => {
    const tx = {
      order: { create: jest.fn().mockResolvedValue({ id: 102 }) },
      orderStation: { findMany: jest.fn() },
      orderStationImage: { updateMany: jest.fn() },
    };
    const prisma = buildCreatePrisma(tx);
    const consumeFortuneReward = jest.fn();
    const service = stubbedService(
      prisma,
      {
        estimatedItemsCost: 100,
        shipping: 0,
        total: 100,
        rewardId: 12,
        freeDelivery: true,
        deliveryDiscount: 30,
      },
      { consumeFortuneReward },
    );

    const result = await service.createCustomDeliveryOrder({
      stops: [
        { lat: 24.7, lng: 46.6 },
        { lat: 24.8, lng: 46.7 },
      ],
      paymentMethod: PaymentMethod.CASH,
      userId: 5,
      fortuneRewardId: 12,
    } as any);

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shipping: 0,
          discountAmount: 0,
          totalPriceAfterDiscount: 100,
        }),
      }),
    );
    expect(consumeFortuneReward).toHaveBeenCalledWith(tx, 12, 5, 102);
    expect(consumeFortuneReward.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.order.create.mock.invocationCallOrder[0],
    );
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 102 },
      data: {
        invoice: expect.objectContaining({
          summary: expect.objectContaining({
            shipping: 0,
            rewardId: 12,
            freeDelivery: true,
            deliveryDiscount: 30,
            total: 100,
          }),
        }),
      },
    });
    expect(result).toEqual({ id: 102 });
  });

  it('does not create an order when custom-delivery reward validation rejects', async () => {
    const tx = {
      order: { create: jest.fn().mockResolvedValue({ id: 103 }) },
      orderStation: { findMany: jest.fn() },
      orderStationImage: { updateMany: jest.fn() },
    };
    const prisma = buildCreatePrisma(tx);
    const service = stubbedService(prisma);
    (service.calculateCustomDeliveryOrder as jest.Mock).mockRejectedValueOnce(
      new Error(
        'Only free-delivery rewards can be used with custom delivery orders',
      ),
    );

    await expect(
      service.createCustomDeliveryOrder({
        stops: [
          { lat: 24.7, lng: 46.6 },
          { lat: 24.8, lng: 46.7 },
        ],
        paymentMethod: PaymentMethod.CASH,
        userId: 5,
        fortuneRewardId: 12,
      } as any),
    ).rejects.toThrow(
      'Only free-delivery rewards can be used with custom delivery orders',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('rolls back when reward consumption fails inside the transaction', async () => {
    const tx = {
      order: { create: jest.fn().mockResolvedValue({ id: 104 }) },
      orderStation: { findMany: jest.fn() },
      orderStationImage: { updateMany: jest.fn() },
    };
    const prisma = buildCreatePrisma(tx);
    const consumeFortuneReward = jest
      .fn()
      .mockRejectedValue(new Error('Reward no longer available'));
    const service = stubbedService(
      prisma,
      {
        shipping: 0,
        total: 100,
        rewardId: 12,
        freeDelivery: true,
        deliveryDiscount: 30,
      },
      { consumeFortuneReward },
    );

    await expect(
      service.createCustomDeliveryOrder({
        stops: [
          { lat: 24.7, lng: 46.6 },
          { lat: 24.8, lng: 46.7 },
        ],
        paymentMethod: PaymentMethod.CASH,
        userId: 5,
        fortuneRewardId: 12,
      } as any),
    ).rejects.toThrow('Reward no longer available');

    expect(tx.order.create).toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createCustomDeliveryOrder — WALLET payment proof validation
// transferType (Vodafone Cash / InstaPay / Bank Transfer) is no longer
// required — the customer only has to supply the transfer image + the phone
// number transferred from. Only an explicit BANK_TRANSFER still requires its
// own transferAccountNumber field instead of a phone number.
// ---------------------------------------------------------------------------

describe('createCustomDeliveryOrder — WALLET payment proof validation', () => {
  const buildCreatePrisma = () => ({
    order: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 200 }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (cb: any) =>
      cb({ order: { create: jest.fn().mockResolvedValue({ id: 200 }) } }),
    ),
  });

  const stubbedService = (prisma: any) => {
    const service = buildService({
      prisma,
      settingService: {
        getSettings: jest.fn().mockResolvedValue({ customDeliveryEnabled: true }),
      },
      zoneService: {
        firstPointOutsideActiveZones: jest.fn().mockResolvedValue(-1),
        resolveZoneId: jest.fn().mockResolvedValue(null),
      },
      assignmentService: { handleOrderAssignment: jest.fn() },
    });
    jest.spyOn(service, 'calculateCustomDeliveryOrder').mockResolvedValue({
      estimatedItemsCost: 0,
      globalCommission: 0,
      extraStopFee: 0,
      adminCommission: 0,
      shipping: 30,
      total: 30,
      freeDelivery: false,
      deliveryDiscount: 0,
    } as any);
    return service;
  };

  const baseStops = [
    { lat: 24.7, lng: 46.6 },
    { lat: 24.8, lng: 46.7 },
  ];

  it('accepts a WALLET order with just transferImage + transferNumber, no transferType', async () => {
    const service = stubbedService(buildCreatePrisma());

    await expect(
      service.createCustomDeliveryOrder({
        stops: baseStops,
        paymentMethod: PaymentMethod.WALLET,
        userId: 5,
        transferImage: 'uploads/transfers/x.png',
        transferNumber: '01012345678',
      } as any),
    ).resolves.toBeDefined();
  });

  it('rejects a WALLET order missing transferImage', async () => {
    const service = stubbedService(buildCreatePrisma());

    await expect(
      service.createCustomDeliveryOrder({
        stops: baseStops,
        paymentMethod: PaymentMethod.WALLET,
        userId: 5,
        transferNumber: '01012345678',
      } as any),
    ).rejects.toThrow('صورة إيصال التحويل مطلوبة لإتمام الطلب');
  });

  it('rejects a WALLET order missing transferNumber (transferType still unset)', async () => {
    const service = stubbedService(buildCreatePrisma());

    await expect(
      service.createCustomDeliveryOrder({
        stops: baseStops,
        paymentMethod: PaymentMethod.WALLET,
        userId: 5,
        transferImage: 'uploads/transfers/x.png',
      } as any),
    ).rejects.toThrow('رقم الهاتف الذي قمت بالتحويل منه مطلوب');
  });

  it('still requires transferAccountNumber when transferType is explicitly BANK_TRANSFER', async () => {
    const service = stubbedService(buildCreatePrisma());

    await expect(
      service.createCustomDeliveryOrder({
        stops: baseStops,
        paymentMethod: PaymentMethod.WALLET,
        userId: 5,
        transferImage: 'uploads/transfers/x.png',
        transferType: 'BANK_TRANSFER',
      } as any),
    ).rejects.toThrow('رقم الحساب البنكي أو الآيبان مطلوب');
  });
});

// ---------------------------------------------------------------------------
// createCustomDeliveryOrder — service-area coverage gate
// All stops (pickup, drop-off, every intermediate station) must be inside an
// active service zone. The geometry itself is covered by ZoneService's own
// spec; here we assert the create PATH enforces it before any DB write, names
// the offending stop, and creates nothing on rejection.
// ---------------------------------------------------------------------------

describe('createCustomDeliveryOrder — service-area coverage gate', () => {
  const buildGatePrisma = () => {
    const tx = { order: { create: jest.fn().mockResolvedValue({ id: 100 }) } };
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    return { prisma, tx };
  };

  const gateService = (prisma: any, firstOutside: number) => {
    const firstPointOutsideActiveZones = jest
      .fn()
      .mockResolvedValue(firstOutside);
    const service = buildService({
      prisma,
      zoneService: {
        firstPointOutsideActiveZones,
        resolveZoneId: jest.fn().mockResolvedValue(1),
      },
      assignmentService: { handleOrderAssignment: jest.fn() },
    });
    jest.spyOn(service, 'calculateCustomDeliveryOrder').mockResolvedValue({
      estimatedItemsCost: 0,
      globalCommission: 0,
      extraStopFee: 0,
      adminCommission: 0,
      shipping: 30,
      total: 30,
    } as any);
    return { service, firstPointOutsideActiveZones };
  };

  // Three Cairo-ish stops; the mocked gate decides which one is "outside".
  const threeStops = () => [
    { lat: 30.044, lng: 31.235 },
    { lat: 30.05, lng: 31.3 },
    { lat: 30.06, lng: 31.34 },
  ];

  it('rejects when the pickup (first stop) is outside all zones, creating nothing', async () => {
    const { prisma, tx } = buildGatePrisma();
    const { service } = gateService(prisma, 0);

    await expect(
      service.createCustomDeliveryOrder({
        stops: threeStops(),
        paymentMethod: PaymentMethod.CASH,
        userId: 5,
      } as any),
    ).rejects.toThrow('Pickup location is outside our service zones');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('rejects when the drop-off (last stop) is outside all zones', async () => {
    const { prisma, tx } = buildGatePrisma();
    const { service } = gateService(prisma, 2);

    await expect(
      service.createCustomDeliveryOrder({
        stops: threeStops(),
        paymentMethod: PaymentMethod.CASH,
        userId: 5,
      } as any),
    ).rejects.toThrow('Delivery destination is outside our service zones');

    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('rejects when an intermediate stop is outside all zones', async () => {
    const { prisma, tx } = buildGatePrisma();
    const { service } = gateService(prisma, 1);

    await expect(
      service.createCustomDeliveryOrder({
        stops: threeStops(),
        paymentMethod: PaymentMethod.CASH,
        userId: 5,
      } as any),
    ).rejects.toThrow(/\*2\*.*outside our service zones/);

    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('creates the order when every stop is covered, after validating all stops', async () => {
    const tx = {
      order: { create: jest.fn().mockResolvedValue({ id: 100 }) },
      orderStation: { findMany: jest.fn() },
      orderStationImage: { updateMany: jest.fn() },
    };
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const { service, firstPointOutsideActiveZones } = gateService(prisma, -1);
    const stops = threeStops();

    const result = await service.createCustomDeliveryOrder({
      stops,
      paymentMethod: PaymentMethod.CASH,
      userId: 5,
    } as any);

    // gate ran against the full stop list (pickup + waypoints + drop-off)
    expect(firstPointOutsideActiveZones).toHaveBeenCalledWith(stops);
    expect(tx.order.create).toHaveBeenCalled();
    expect(result).toEqual({ id: 100 });
  });
});
