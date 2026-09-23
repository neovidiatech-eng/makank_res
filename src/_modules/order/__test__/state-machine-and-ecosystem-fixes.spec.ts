import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderStatus, OrderType } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { HelpersService } from '../services/helpers.service';
import { getOrderArgs } from '../prisma-args/order.prisma.args';
import { StoreController } from 'src/_modules/store/controllers/store.controller';
import { StoreService } from 'src/_modules/store/services/store.service';

const buildHelpers = () =>
  new HelpersService(
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
  );

const userOf = (roleKey: string, id: number = 1) => ({ id, Role: { roleKey } }) as any;
const orderOf = (status: OrderStatus, id: number = 99, type: OrderType = OrderType.DELIVERY) =>
  ({ id, status, type }) as any;

describe('Ecosystem Automated Tests — Backend Fixes Verification', () => {
  const helpers = buildHelpers();

  describe('1. Order State Machine & Terminal State Protection', () => {
    it('blocks modification of DELIVERED order (terminal state) with BadRequestException', () => {
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.DELIVERY),
          orderOf(OrderStatus.DELIVERED),
          OrderStatus.ON_THE_WAY,
        ),
      ).toThrow(BadRequestException);
    });

    it('blocks modification of CANCELLED order (terminal state) with BadRequestException', () => {
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.STORE),
          orderOf(OrderStatus.CANCELLED),
          OrderStatus.PREPARING,
        ),
      ).toThrow(BadRequestException);
    });

    it('blocks modification of REJECTED order (terminal state) with BadRequestException', () => {
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.STORE),
          orderOf(OrderStatus.REJECTED),
          OrderStatus.READY_PICKUP,
        ),
      ).toThrow(BadRequestException);
    });

    it('blocks illegal state transition skip: PENDING directly to DELIVERED by Store or Delivery', () => {
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.STORE),
          orderOf(OrderStatus.PENDING),
          OrderStatus.DELIVERED,
        ),
      ).toThrow(BadRequestException);

      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.DELIVERY),
          orderOf(OrderStatus.PENDING),
          OrderStatus.DELIVERED,
        ),
      ).toThrow(BadRequestException);
    });

    it('blocks illegal state transition skip: PREPARING directly to ON_THE_WAY', () => {
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.DELIVERY),
          orderOf(OrderStatus.PREPARING),
          OrderStatus.ON_THE_WAY,
        ),
      ).toThrow(BadRequestException);
    });

    it('allows sequential valid transitions through full lifecycle', () => {
      // PENDING -> PREPARING (Store accepts)
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.STORE),
          orderOf(OrderStatus.PENDING),
          OrderStatus.PREPARING,
        ),
      ).not.toThrow();

      // PREPARING -> READY_PICKUP (Store finishes preparing)
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.STORE),
          orderOf(OrderStatus.PREPARING),
          OrderStatus.READY_PICKUP,
        ),
      ).not.toThrow();

      // READY_PICKUP -> ON_THE_WAY (Driver picks up)
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.DELIVERY),
          orderOf(OrderStatus.READY_PICKUP),
          OrderStatus.ON_THE_WAY,
        ),
      ).not.toThrow();

      // ON_THE_WAY -> DELIVERED (Driver delivers to customer)
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.DELIVERY),
          orderOf(OrderStatus.ON_THE_WAY),
          OrderStatus.DELIVERED,
        ),
      ).not.toThrow();
    });

    it('allows in-store PICKUP orders to transition from READY_PICKUP directly to DELIVERED', () => {
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.STORE),
          orderOf(OrderStatus.READY_PICKUP, 100, OrderType.PICKUP),
          OrderStatus.DELIVERED,
        ),
      ).not.toThrow();
    });
  });

  describe('2. City Isolation for Authenticated Customers', () => {
    it('reliably sets filters.customerId when user.Role.roleKey is Customer', async () => {
      const mockStoreService = {
        findAll: jest.fn().mockResolvedValue({ total: 0, items: [] }),
        count: jest.fn().mockResolvedValue(0),
      };
      const mockResponseService = {
        success: jest.fn().mockReturnValue({}),
      };
      const controller = new StoreController(
        mockStoreService as any,
        undefined as any,
        undefined as any,
        mockResponseService as any,
        undefined as any,
        undefined as any,
        undefined as any,
      );

      const customerUser = {
        id: 77,
        Role: { roleKey: RolesKeys.CUSTOMER },
      } as any;

      const filters: any = { cityId: 1 };
      const mockRes = {} as any;
      await controller.findAll(mockRes, filters, customerUser);

      expect(mockStoreService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          cityId: 1,
          customerId: 77,
        }),
        false,
      );
    });
  });

  describe('3. City Filtering Includes PICKUP Orders', () => {
    it('produces OR clause for Zone.cityId and Branch.Store.cityId', () => {
      const args = getOrderArgs({ cityId: 3 } as any, []);
      const whereAnd = (args.where as any).AND;

      const cityClause = whereAnd.find(
        (clause: any) => clause.OR && clause.OR.length === 2,
      );

      expect(cityClause).toBeDefined();
      expect(cityClause.OR).toEqual([
        { Zone: { cityId: 3 } },
        { Branch: { Store: { cityId: 3 } } },
      ]);
    });
  });

  describe('4. Generalize Zone Prices Clears Overrides', () => {
    it('deletes StoreZonePrice overrides when setAllStoresZonePrices is called', async () => {
      const mockDeleteMany = jest.fn().mockResolvedValue({ count: 5 });
      const mockUpdate = jest.fn().mockResolvedValue({});
      const mockUpdateMany = jest.fn().mockResolvedValue({ count: 10 });

      const prisma = {
        $transaction: jest.fn(async (ops: any) => Promise.all(ops)),
        storeZonePrice: { deleteMany: mockDeleteMany },
        zone: {
          update: mockUpdate,
          count: jest.fn().mockResolvedValue(2),
          findMany: jest.fn().mockResolvedValue([]),
        },
        store: { updateMany: mockUpdateMany },
      };

      const mockSettingService = {
        getSettings: jest.fn().mockResolvedValue({
          filterByZone: false,
          globalZonePricingEnabled: true,
        }),
      };

      const storeService = new StoreService(
        prisma as any,
        {} as any,
        {} as any,
        mockSettingService as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
      );

      await storeService.setAllStoresZonePrices({
        zonePrices: [
          { zoneId: 10, price: 15 },
          { zoneId: 11, price: 20 },
        ],
      });

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { zoneId: { in: [10, 11] } },
      });
    });
  });
});
