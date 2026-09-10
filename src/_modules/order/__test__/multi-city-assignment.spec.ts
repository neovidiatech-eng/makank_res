import { AssignmentService } from '../services/assignment.service';
import { AssignmentStatus, OrderType } from '@prisma/client';

describe('AssignmentService — Multi-City Driver Assignment Scoping', () => {
  let assignmentService: AssignmentService;
  let mockPrisma: any;
  let mockSettingService: any;
  let mockNotificationService: any;

  beforeEach(() => {
    mockPrisma = {
      order: {
        findUnique: jest.fn(),
      },
      city: {
        findUnique: jest.fn(),
      },
      deliveryDetails: {
        findMany: jest.fn(),
      },
      orderDeliveryAssignment: {
        create: jest.fn(),
      },
    };
    mockSettingService = {
      getSettings: jest.fn().mockResolvedValue({ deliveryAssignmentMode: 'AUTO', deliveryAcceptanceTimer: '90' }),
    };
    mockNotificationService = {
      sendLocalizedNotification: jest.fn().mockResolvedValue(true),
    };

    assignmentService = new AssignmentService(
      mockPrisma as any,
      mockSettingService as any,
      mockNotificationService as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('restricts candidate drivers to city bounding box when order belongs to a city', async () => {
    const orderId = 123;
    const orderCityId = 5;

    mockPrisma.order.findUnique.mockResolvedValue({
      id: orderId,
      type: OrderType.DELIVERY,
      Branch: {
        lat: 30.7865,
        lng: 31.0004,
        Store: {
          cityId: orderCityId,
        },
      },
      Address: { lat: 30.79, lng: 31.01 },
      Zone: { cityId: orderCityId },
    });

    mockPrisma.city.findUnique.mockResolvedValue({
      lat: 30.7865,
      lng: 31.0004,
      radius: 15,
    });

    mockPrisma.deliveryDetails.findMany.mockResolvedValue([
      { userId: 42, lat: 30.7870, lng: 31.0010 },
    ]);

    mockPrisma.orderDeliveryAssignment.create.mockResolvedValue({
      id: 999,
      orderId,
      deliveryId: 42,
      status: AssignmentStatus.PENDING,
    });

    await assignmentService.assignToNearestDelivery(orderId);

    const findCall = mockPrisma.deliveryDetails.findMany.mock.calls[0][0];
    expect(findCall.where.availableNow).toBe(true);
    expect(findCall.where.lat).toBeDefined();
    expect(findCall.where.lng).toBeDefined();

    const delta = 15 / 111;
    expect(findCall.where.lat.gte).toBeCloseTo(30.7865 - delta, 4);
    expect(findCall.where.lat.lte).toBeCloseTo(30.7865 + delta, 4);

    expect(mockPrisma.orderDeliveryAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId,
          deliveryId: 42,
        }),
      }),
    );
  });

  it('omits geographic bounds filter when order has no resolvable city (fallback mode)', async () => {
    const orderId = 456;

    mockPrisma.order.findUnique.mockResolvedValue({
      id: orderId,
      type: OrderType.CUSTOM_DELIVERY,
      pickupLat: 30.50,
      pickupLng: 31.50,
      Branch: null,
      Zone: null,
    });

    mockPrisma.deliveryDetails.findMany.mockResolvedValue([
      { userId: 88, lat: 30.51, lng: 31.51 },
    ]);

    mockPrisma.orderDeliveryAssignment.create.mockResolvedValue({
      id: 1000,
      orderId,
      deliveryId: 88,
    });

    await assignmentService.assignToNearestDelivery(orderId);

    const findCall = mockPrisma.deliveryDetails.findMany.mock.calls[0][0];
    expect(findCall.where.lat).toBeUndefined();
    expect(findCall.where.lng).toBeUndefined();
  });
});
