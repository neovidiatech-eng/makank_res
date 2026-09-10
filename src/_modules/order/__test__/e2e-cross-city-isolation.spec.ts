import { BadRequestException } from '@nestjs/common';
import { HelpersService } from '../services/helpers.service';
import { AssignmentService } from '../services/assignment.service';
import { HomeService } from '../../home/home.service';
import { ZoneService } from '../../zone/zone.service';
import * as resolveCityHelper from 'src/globals/helpers/resolve-city-for-point.helper';
import * as polygonHelper from 'src/globals/helpers/point-in-polygon.helper';
import { AssignmentStatus, OrderType } from '@prisma/client';

describe('Cross-City Complete Isolation Test — Mahalla vs Tanta vs Hurghada', () => {
  // City 1: El-Mahalla El-Kubra (cityId: 1, lat: 30.97, lng: 31.16)
  // City 2: Tanta (cityId: 2, lat: 30.78, lng: 31.00)
  // City 3: Hurghada (cityId: 3, lat: 27.25, lng: 33.81)

  const CITY_MAHALLA = { id: 1, name: '??????', lat: 30.97, lng: 31.16, radius: 15 };
  const CITY_TANTA = { id: 2, name: '????', lat: 30.78, lng: 31.00, radius: 15 };
  const CITY_HURGHADA = { id: 3, name: '???????', lat: 27.25, lng: 33.81, radius: 25 };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Driver Assignment Isolation', () => {
    it('NEVER assigns an order in Mahalla to a driver in Tanta or Hurghada even if they are available', async () => {
      const mockPrisma: any = {
        order: { findUnique: jest.fn() },
        city: { findUnique: jest.fn() },
        deliveryDetails: { findMany: jest.fn() },
        orderDeliveryAssignment: { create: jest.fn() },
      };
      const mockSettings: any = {
        getSettings: jest.fn().mockResolvedValue({ deliveryAssignmentMode: 'AUTO', deliveryAcceptanceTimer: '90' }),
      };
      const mockNotifications: any = { sendLocalizedNotification: jest.fn().mockResolvedValue(true) };

      const assignmentService = new AssignmentService(mockPrisma, mockSettings, mockNotifications);

      const orderInMahalla = {
        id: 5001,
        type: OrderType.DELIVERY,
        Branch: {
          lat: CITY_MAHALLA.lat,
          lng: CITY_MAHALLA.lng,
          Store: { cityId: CITY_MAHALLA.id },
        },
        Zone: { cityId: CITY_MAHALLA.id },
      };

      mockPrisma.order.findUnique.mockResolvedValue(orderInMahalla);
      mockPrisma.city.findUnique.mockResolvedValue(CITY_MAHALLA);

      // Drivers in system:
      // Driver 1: in Mahalla (lat: 30.972, lng: 31.162)
      // Driver 2: in Tanta (lat: 30.78, lng: 31.00)
      // Driver 3: in Hurghada (lat: 27.25, lng: 33.81)
      const driverMahalla = { userId: 101, lat: 30.972, lng: 31.162, availableNow: true };

      // The DB query must filter by Mahalla bounding box, returning ONLY Driver 1
      mockPrisma.deliveryDetails.findMany.mockImplementation((args: any) => {
        const delta = CITY_MAHALLA.radius / 111;
        const minLat = CITY_MAHALLA.lat - delta;
        const maxLat = CITY_MAHALLA.lat + delta;

        // Verify the query bounding box strictly matches Mahalla
        expect(args.where.lat.gte).toBeCloseTo(minLat, 3);
        expect(args.where.lat.lte).toBeCloseTo(maxLat, 3);

        return Promise.resolve([driverMahalla]);
      });

      mockPrisma.orderDeliveryAssignment.create.mockResolvedValue({
        id: 99,
        orderId: 5001,
        deliveryId: driverMahalla.userId,
      });

      await assignmentService.assignToNearestDelivery(5001);

      // Assigned to driver in Mahalla ONLY
      expect(mockPrisma.orderDeliveryAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 5001,
            deliveryId: 101,
          }),
        }),
      );
    });
  });

  describe('2. Zone Resolution Isolation', () => {
    it('customer in Tanta only matches Tanta zones and cannot resolve to Mahalla zones', async () => {
      const mockPrisma: any = { zone: { findMany: jest.fn() } };
      const zoneService = new ZoneService(mockPrisma, undefined as any);

      // Customer coordinates in Tanta
      const customerTantaLat = 30.788;
      const customerTantaLng = 31.002;

      jest.spyOn(resolveCityHelper, 'resolveCityForPoint').mockResolvedValue({
        id: CITY_TANTA.id,
        distanceKm: 1.2,
      });

      jest.spyOn(polygonHelper, 'isPointInPolygon').mockReturnValue(true);

      mockPrisma.zone.findMany.mockResolvedValue([
        { id: 201, name: { ar: '????? ??????? ????' }, coordinates: [{ lat: 30.78, lng: 31.00 }] },
      ]);

      const zoneId = await zoneService.resolveZoneId(customerTantaLat, customerTantaLng);

      expect(zoneId).toBe(201);
      // Confirms query was strictly scoped to Tanta (cityId: 2)
      expect(mockPrisma.zone.findMany).toHaveBeenCalledWith({
        where: { active: true, cityId: CITY_TANTA.id },
        select: { id: true, coordinates: true },
      });
    });
  });

  describe('3. Coupon Zone Isolation', () => {
    it('coupon restricted to Tanta zone is REJECTED when used in Mahalla', async () => {
      const mockPrisma: any = {};
      const helpersService = new HelpersService(
        mockPrisma as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
      );

      const tantaZoneId = 201;
      const mahallaZoneId = 101;

      const couponForTantaOnly = {
        id: 77, active: true,
        code: 'TANTA_DISCOUNT',
        CouponZones: [{ zoneId: tantaZoneId }],
        startDate: null,
        endDate: new Date(Date.now() + 86400000), usageCount: 0, maxUsage: 100,
        orderMinPrice: 0,
        amount: 20,
        discountType: 'FIXED',
      };

      // When customer in Mahalla tries to use Tanta coupon
      expect(() => {
        helpersService.isCouponValid(couponForTantaOnly as any, 100, mahallaZoneId);
      }).toThrow(BadRequestException);

      // When customer in Tanta uses it -> allowed
      expect(() => {
        helpersService.isCouponValid(couponForTantaOnly as any, 100, tantaZoneId);
      }).not.toThrow();
    });
  });

  describe('4. Banner Isolation', () => {
    it('customer in Mahalla sees Mahalla banners + Global banners, but NEVER Hurghada banners', async () => {
      const mockPrisma: any = {
        storeTemplate: { findMany: jest.fn().mockResolvedValue([]) },
        templateCategory: { findMany: jest.fn().mockResolvedValue([]) },
        banner: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const homeService = new HomeService(mockPrisma);

      jest.spyOn(resolveCityHelper, 'resolveCityForPoint').mockResolvedValue({
        id: CITY_MAHALLA.id,
        distanceKm: 0.5,
      });

      await homeService.getHome(CITY_MAHALLA.lat, CITY_MAHALLA.lng);

      const bannerFindCall = mockPrisma.banner.findMany.mock.calls[0][0];
      const andClauses = bannerFindCall.where.AND;

      const cityFilter = andClauses.find((clause: any) =>
        clause.OR && clause.OR.some((c: any) => c.Zones?.some?.Zone?.cityId !== undefined),
      );

      expect(cityFilter).toBeDefined();
      expect(cityFilter.OR[0].Zones.some.Zone.cityId).toBe(CITY_MAHALLA.id);
      expect(cityFilter.OR[1].Zones.none).toEqual({});
    });
  });
});
