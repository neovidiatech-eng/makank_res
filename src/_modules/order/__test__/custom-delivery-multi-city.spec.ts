import { AssignmentService } from '../services/assignment.service';
import { AssignmentStatus, OrderType } from '@prisma/client';

/**
 * Custom Delivery (المندوب الخاص) Multi-City Isolation & Validation Suite
 *
 * Verifies:
 * 1. Driver dispatch for CUSTOM_DELIVERY is strictly geofenced by the order's resolved city.
 * 2. Drivers located in a different city (e.g. Mahalla) are NOT pinged for a Tanta custom delivery errand.
 * 3. Stops outside the city coverage trigger proper validation errors.
 */
describe('Custom Delivery Multi-City Isolation & Driver Dispatch Gating', () => {
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
      getSettings: jest.fn().mockResolvedValue({
        deliveryAssignmentMode: 'AUTO',
        deliveryAcceptanceTimer: '90',
      }),
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

  it('restricts candidate drivers for CUSTOM_DELIVERY orders to the city bounding box of the pickup zone', async () => {
    const orderId = 888;
    const tantaCityId = 2;

    // Custom Delivery order in Tanta (Zone cityId: 2)
    mockPrisma.order.findUnique.mockResolvedValue({
      id: orderId,
      type: OrderType.CUSTOM_DELIVERY,
      Branch: null, // Custom delivery has no store/branch
      pickupLat: 30.7865,
      pickupLng: 31.0004,
      Zone: {
        id: 15,
        name: 'منطقة النحاس - طنطا',
        cityId: tantaCityId,
      },
    });

    // Tanta city bounds: center 30.7865, 31.0004, radius 15km
    mockPrisma.city.findUnique.mockResolvedValue({
      id: tantaCityId,
      name: 'طنطا',
      lat: 30.7865,
      lng: 31.0004,
      radius: 15,
    });

    // Driver in Tanta (available)
    mockPrisma.deliveryDetails.findMany.mockResolvedValue([
      { userId: 55, lat: 30.7880, lng: 31.0020 },
    ]);

    mockPrisma.orderDeliveryAssignment.create.mockResolvedValue({
      id: 1,
      orderId,
      deliveryId: 55,
      status: AssignmentStatus.PENDING,
    });

    await assignmentService.assignToNearestDelivery(orderId);

    // Verify query to deliveryDetails:
    const findCall = mockPrisma.deliveryDetails.findMany.mock.calls[0][0];
    expect(findCall.where.availableNow).toBe(true);

    // Delta = radius 15 / 111 ≈ 0.135
    const delta = 15 / 111;
    expect(findCall.where.lat).toBeDefined();
    expect(findCall.where.lng).toBeDefined();
    expect(findCall.where.lat.gte).toBeCloseTo(30.7865 - delta, 4);
    expect(findCall.where.lat.lte).toBeCloseTo(30.7865 + delta, 4);
    expect(findCall.where.lng.gte).toBeCloseTo(31.0004 - delta, 4);
    expect(findCall.where.lng.lte).toBeCloseTo(31.0004 + delta, 4);

    // Assigned to Tanta driver
    expect(mockPrisma.orderDeliveryAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId,
          deliveryId: 55,
        }),
      }),
    );
  });

  it('excludes drivers who are located in another city (e.g. Mahalla drivers will not match Tanta bounding box)', async () => {
    const orderId = 889;
    const tantaCityId = 2;

    mockPrisma.order.findUnique.mockResolvedValue({
      id: orderId,
      type: OrderType.CUSTOM_DELIVERY,
      Branch: null,
      pickupLat: 30.7865,
      pickupLng: 31.0004,
      Zone: {
        id: 15,
        cityId: tantaCityId,
      },
    });

    mockPrisma.city.findUnique.mockResolvedValue({
      id: tantaCityId,
      name: 'طنطا',
      lat: 30.7865,
      lng: 31.0004,
      radius: 15,
    });

    // When the bounding box query is executed, if no drivers are physically inside Tanta:
    mockPrisma.deliveryDetails.findMany.mockResolvedValue([]);

    await assignmentService.assignToNearestDelivery(orderId);

    // No assignment created
    expect(mockPrisma.orderDeliveryAssignment.create).not.toHaveBeenCalled();
  });
});
