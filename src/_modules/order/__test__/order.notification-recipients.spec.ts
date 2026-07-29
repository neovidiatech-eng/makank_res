// Phase 1 regression tests for the order status-change notification leak.
//
// Bug: `prisma.user.findMany({ where: { branchId: order.branchId } })` with a NULL branchId
// compiles to `WHERE branch_id IS NULL`, matching every branch-less user (all customers, admins,
// drivers) — broadcasting a customer-facing `type=ORDER` notification to the whole user base.
//
// Phase 1 fix: only run the store-user lookup when `order.branchId != null`, and passively log
// (not block) any ORDER notification sent to a non-owner. No notification types are changed.
//
// These tests use a mocked Prisma + stubbed collaborators (no MySQL/Redis/Nest DI), mirroring
// custom-delivery.spec.ts.

import {
  NotificationType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { RolesKeys } from '../../authorization/providers/roles';
import { OrderService } from '../order.service';

// Construct the service with only the deps changeStatus touches on the CANCELLED/ON_THE_WAY paths.
// Positional constructor args must match OrderService's constructor order.
const buildService = (
  d: {
    prisma?: any;
    helpers?: any;
    notificationService?: any;
  } = {},
): OrderService =>
  new OrderService(
    d.prisma as any, // prisma
    undefined as any, // languages
    d.helpers as any, // helpers
    undefined as any, // walletService
    undefined as any, // paymentService
    undefined as any, // transactionService
    (d.notificationService ?? { sendLocalizedNotification: jest.fn() }) as any, // notificationService
    undefined as any, // mapService
    undefined as any, // settingService
    undefined as any, // assignmentService
    undefined as any, // serviceHelper
    undefined as any, // kashierService
    undefined as any, // zoneService
    undefined as any, // afkBreakService
    undefined as any, // logsService
    { broadcastNewOrder: jest.fn(), broadcastOrderStatusChanged: jest.fn() } as any, // orderTrackingGateway
  );

const buildHelpers = (order: any) => ({
  getOrderById: jest.fn().mockResolvedValue(order),
  canUserAccessOrderId: jest.fn().mockResolvedValue(undefined),
  assertStatusTransitionAllowed: jest.fn().mockReturnValue(undefined),
});

// findMany resolves admins when the query filters by roleKey ADMIN, else the store-user set.
const buildPrisma = ({
  adminUsers = [] as Array<{ id: number }>,
  storeUsers = [] as Array<{ id: number }>,
} = {}) => {
  const tx = { order: { update: jest.fn() } };
  return {
    user: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          where?.roleKey === RolesKeys.ADMIN ? adminUsers : storeUsers,
        ),
      ),
    },
    order: { update: jest.fn() },
    deliveryDetails: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    __tx: tx,
  };
};

// Triggerer is an admin whose id differs from the owner, so the order owner is always a recipient
// and the DELIVERY-only location checks are skipped.
const adminTriggerer = { id: 999, Role: { roleKey: RolesKeys.ADMIN } } as any;

const OWNER_ID = 213;
const makeOrder = (over: Record<string, any> = {}) => ({
  id: 98,
  userId: OWNER_ID, // order owner / customer_id
  branchId: null,
  deliveryId: null,
  addressId: null,
  status: OrderStatus.PENDING,
  paymentStatus: PaymentStatus.UNPAID, // unpaid → CANCELLED skips the refund/transaction path
  type: OrderType.CUSTOM_DELIVERY,
  OrderItems: [],
  ...over,
});

// Calls that queried users by branch (the broadcast query).
const branchQueries = (findMany: jest.Mock) =>
  findMany.mock.calls.filter(
    ([arg]: any) => arg?.where && 'branchId' in arg.where,
  );

describe('OrderService.changeStatus — Phase 1 notification recipient guard', () => {
  it('null-branch CANCELLED: only the order owner receives a type=ORDER notification', async () => {
    const order = makeOrder({ branchId: null });
    // storeUsers intentionally non-empty: if the guard regressed, these would leak in.
    const prisma = buildPrisma({
      adminUsers: [],
      storeUsers: [{ id: 1 }, { id: 2 }],
    });
    const notificationService = { sendLocalizedNotification: jest.fn() };
    const service = buildService({
      prisma,
      helpers: buildHelpers(order),
      notificationService,
    });

    await service.changeStatus(order.id, OrderStatus.CANCELLED, adminTriggerer);

    expect(notificationService.sendLocalizedNotification).toHaveBeenCalledTimes(
      1,
    );
    const [recipientId, , , , type, resourceId] =
      notificationService.sendLocalizedNotification.mock.calls[0];
    expect(recipientId).toBe(OWNER_ID);
    expect(type).toBe(NotificationType.ORDER);
    expect(resourceId).toBe(order.id);

    // The broadcast query (store users by branchId) must NOT have run for a branch-less order.
    expect(branchQueries(prisma.user.findMany)).toHaveLength(0);
  });

  it('null-branch ON_THE_WAY: no branch-less user other than the owner receives type=ORDER', async () => {
    const order = makeOrder({ branchId: null });
    const prisma = buildPrisma({
      storeUsers: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const notificationService = { sendLocalizedNotification: jest.fn() };
    const service = buildService({
      prisma,
      helpers: buildHelpers(order),
      notificationService,
    });

    await service.changeStatus(
      order.id,
      OrderStatus.ON_THE_WAY,
      adminTriggerer,
    );

    const recipients =
      notificationService.sendLocalizedNotification.mock.calls.map(
        (c: any) => c[0],
      );
    expect(recipients).toEqual([OWNER_ID]);
    expect(branchQueries(prisma.user.findMany)).toHaveLength(0);
  });

  it('branched CANCELLED: store + admin + owner still receive (Phase 1 leaves behavior unchanged)', async () => {
    const order = makeOrder({ branchId: 5, type: OrderType.DELIVERY });
    const prisma = buildPrisma({
      adminUsers: [{ id: 7 }],
      storeUsers: [{ id: 91 }],
    });
    const notificationService = { sendLocalizedNotification: jest.fn() };
    const service = buildService({
      prisma,
      helpers: buildHelpers(order),
      notificationService,
    });
    const warn = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    await service.changeStatus(order.id, OrderStatus.CANCELLED, adminTriggerer);

    const recipients =
      notificationService.sendLocalizedNotification.mock.calls.map(
        (c: any) => c[0],
      );
    // owner (213) + store staff (91) + admin (7) — unchanged from pre-fix behavior on a real branch.
    expect(new Set(recipients)).toEqual(new Set([OWNER_ID, 91, 7]));
    // All still sent under the existing customer ORDER contract (no re-typing in Phase 1).
    for (const call of notificationService.sendLocalizedNotification.mock
      .calls) {
      expect(call[4]).toBe(NotificationType.ORDER);
    }
    // The store-by-branch query DID run for a real branch.
    expect(branchQueries(prisma.user.findMany).length).toBeGreaterThan(0);
    // Passive guard logged exactly the two non-owner recipients (91, 7) — no throw/block.
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('owner notification is preserved and not warned about (customer behavior unchanged)', async () => {
    const order = makeOrder({ branchId: 5, type: OrderType.DELIVERY });
    const prisma = buildPrisma({ adminUsers: [], storeUsers: [] });
    const notificationService = { sendLocalizedNotification: jest.fn() };
    const service = buildService({
      prisma,
      helpers: buildHelpers(order),
      notificationService,
    });
    const warn = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    await service.changeStatus(order.id, OrderStatus.CANCELLED, adminTriggerer);

    const recipients =
      notificationService.sendLocalizedNotification.mock.calls.map(
        (c: any) => c[0],
      );
    expect(recipients).toEqual([OWNER_ID]);
    // The owner is the order owner → never warned about.
    expect(warn).not.toHaveBeenCalled();
  });

  it('REJECTED with wallet payment already taken: admins get an extra refund-owed alert (no automatic refund)', async () => {
    const order = makeOrder({
      branchId: 5,
      type: OrderType.DELIVERY,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.WALLET,
      totalPriceAfterDiscount: 45,
    });
    const prisma = buildPrisma({ adminUsers: [{ id: 7 }], storeUsers: [] });
    const notificationService = { sendLocalizedNotification: jest.fn() };
    const service = buildService({
      prisma,
      helpers: buildHelpers(order),
      notificationService,
    });

    await service.changeStatus(order.id, OrderStatus.REJECTED, adminTriggerer);

    const calls = notificationService.sendLocalizedNotification.mock.calls;
    // owner (general status update) + admin (general status update) + admin (refund-owed alert)
    const adminRefundAlertCalls = calls.filter(
      (c: any) => c[0] === 7 && c[1]?.en?.includes('refund owed'),
    );
    expect(adminRefundAlertCalls).toHaveLength(1);
    expect(adminRefundAlertCalls[0][2].en).toContain('#98');
    expect(adminRefundAlertCalls[0][4]).toBe(NotificationType.ADMIN);

    // No refund happens automatically — the transaction never runs refundOrder.
    expect(prisma.__tx.order.update).toHaveBeenCalledTimes(1);
  });

  it('REJECTED on a cash order that was never paid: no refund-owed alert (nothing was actually taken)', async () => {
    const order = makeOrder({
      branchId: 5,
      type: OrderType.DELIVERY,
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: PaymentMethod.CASH,
    });
    const prisma = buildPrisma({ adminUsers: [{ id: 7 }], storeUsers: [] });
    const notificationService = { sendLocalizedNotification: jest.fn() };
    const service = buildService({
      prisma,
      helpers: buildHelpers(order),
      notificationService,
    });

    await service.changeStatus(order.id, OrderStatus.REJECTED, adminTriggerer);

    const calls = notificationService.sendLocalizedNotification.mock.calls;
    const adminRefundAlertCalls = calls.filter((c: any) =>
      c[1]?.en?.includes('refund owed'),
    );
    expect(adminRefundAlertCalls).toHaveLength(0);
  });
});
