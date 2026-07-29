// A store employee accepting/rejecting/marking-ready an order now stamps
// who did it (Order.acceptedByUserId/rejectedByUserId/readyMarkedByUserId)
// and writes an audit-log entry — the data source for the employee
// performance dashboard and the "سجل التعديلات" audit trail.
import { OrderStatus, OrderType, PaymentStatus } from '@prisma/client';
import { RolesKeys } from '../../authorization/providers/roles';
import { OrderService } from '../order.service';

const buildService = (d: { prisma: any; helpers: any; logsService: any }) =>
  new OrderService(
    d.prisma as any,
    undefined as any,
    d.helpers as any,
    undefined as any,
    undefined as any,
    undefined as any,
    { sendLocalizedNotification: jest.fn() } as any,
    undefined as any,
    { getSettings: jest.fn().mockResolvedValue({}) } as any,
    { handleOrderAssignment: jest.fn() } as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    d.logsService as any,
    { broadcastNewOrder: jest.fn(), broadcastOrderStatusChanged: jest.fn() } as any, // orderTrackingGateway
  );

const OWNER_ID = 5;
const makeOrder = (over: Record<string, any> = {}) => ({
  id: 77,
  userId: OWNER_ID,
  branchId: 9,
  deliveryId: null,
  addressId: null,
  status: OrderStatus.PENDING,
  paymentStatus: PaymentStatus.UNPAID,
  type: OrderType.DELIVERY,
  OrderItems: [{ serviceId: 1, Service: { storeId: 42 } }],
  ...over,
});

const storeUser = {
  id: 88,
  storeId: 42,
  Role: { roleKey: RolesKeys.STORE },
} as any;

const buildHelpers = (order: any) => ({
  getOrderById: jest.fn().mockResolvedValue(order),
  canUserAccessOrderId: jest.fn().mockResolvedValue(undefined),
  assertStatusTransitionAllowed: jest.fn().mockReturnValue(undefined),
});

const buildPrisma = () => {
  const tx = { order: { update: jest.fn() } };
  return {
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ name: 'Mona' }),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    __tx: tx,
  };
};

describe('OrderService.changeStatus — employee attribution + audit log', () => {
  it('stamps acceptedByUserId and logs ORDER_ACCEPTED when a store employee accepts', async () => {
    const order = makeOrder();
    const prisma = buildPrisma();
    const logsService = { createLog: jest.fn() };
    const service = buildService({ prisma, helpers: buildHelpers(order), logsService });

    await service.changeStatus(order.id, OrderStatus.PREPARING, storeUser);

    expect(prisma.__tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acceptedByUserId: 88 }),
      }),
    );
    expect(logsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ORDER_ACCEPTED',
        userId: '88',
        userName: 'Mona',
        storeId: 42,
      }),
    );
  });

  it('stamps rejectedByUserId and logs ORDER_REJECTED', async () => {
    const order = makeOrder();
    const prisma = buildPrisma();
    const logsService = { createLog: jest.fn() };
    const service = buildService({ prisma, helpers: buildHelpers(order), logsService });

    await service.changeStatus(order.id, OrderStatus.REJECTED, storeUser);

    expect(prisma.__tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rejectedByUserId: 88 }),
      }),
    );
    expect(logsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ORDER_REJECTED' }),
    );
  });

  it('stamps readyMarkedByUserId and logs ORDER_READY', async () => {
    const order = makeOrder({ status: OrderStatus.PREPARING });
    const prisma = buildPrisma();
    const logsService = { createLog: jest.fn() };
    const service = buildService({ prisma, helpers: buildHelpers(order), logsService });

    await service.changeStatus(order.id, OrderStatus.READY_PICKUP, storeUser);

    expect(prisma.__tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ readyMarkedByUserId: 88 }),
      }),
    );
    expect(logsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ORDER_READY' }),
    );
  });

  it('does not log or attribute when an admin (not a store employee) changes the status', async () => {
    const order = makeOrder();
    const prisma = buildPrisma();
    const logsService = { createLog: jest.fn() };
    const admin = { id: 1, Role: { roleKey: RolesKeys.ADMIN } } as any;
    const service = buildService({ prisma, helpers: buildHelpers(order), logsService });

    await service.changeStatus(order.id, OrderStatus.PREPARING, admin);

    expect(prisma.__tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ acceptedByUserId: expect.anything() }),
      }),
    );
    expect(logsService.createLog).not.toHaveBeenCalled();
  });
});
