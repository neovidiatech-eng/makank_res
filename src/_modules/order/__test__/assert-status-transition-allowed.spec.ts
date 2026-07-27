// PATCH /orders/:id/:status previously accepted any status from anyone who
// could merely see the order — including the customer setting their own
// order straight to DELIVERED, which triggers wallet payouts without the
// order ever being prepared, picked up, or delivered. This locks each role
// to the handful of transitions it actually owns.
import { ForbiddenException } from '@nestjs/common';
import { OrderStatus, OrderType } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { HelpersService } from '../services/helpers.service';

const buildHelpers = () =>
  new HelpersService(
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
  );

const userOf = (roleKey: string) => ({ Role: { roleKey } }) as any;
const orderOf = (status: OrderStatus, type: OrderType = OrderType.DELIVERY) =>
  ({ status, type }) as any;

describe('HelpersService.assertStatusTransitionAllowed', () => {
  const helpers = buildHelpers();

  it('lets admin set any status', () => {
    expect(() =>
      helpers.assertStatusTransitionAllowed(
        userOf(RolesKeys.ADMIN),
        orderOf(OrderStatus.PENDING),
        OrderStatus.DELIVERED,
      ),
    ).not.toThrow();
  });

  it('blocks the customer from cancelling — cancellation is admin-only', () => {
    expect(() =>
      helpers.assertStatusTransitionAllowed(
        userOf(RolesKeys.CUSTOMER),
        orderOf(OrderStatus.PENDING),
        OrderStatus.CANCELLED,
      ),
    ).toThrow(ForbiddenException);
  });

  it('blocks the customer from marking their own order DELIVERED', () => {
    expect(() =>
      helpers.assertStatusTransitionAllowed(
        userOf(RolesKeys.CUSTOMER),
        orderOf(OrderStatus.PENDING),
        OrderStatus.DELIVERED,
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets the store accept, reject, and mark ready for pickup', () => {
    for (const status of [
      OrderStatus.PREPARING,
      OrderStatus.REJECTED,
      OrderStatus.READY_PICKUP,
    ]) {
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.STORE),
          orderOf(OrderStatus.PENDING),
          status,
        ),
      ).not.toThrow();
    }
  });

  it('blocks the store from marking a DELIVERY order as delivered', () => {
    expect(() =>
      helpers.assertStatusTransitionAllowed(
        userOf(RolesKeys.STORE),
        orderOf(OrderStatus.READY_PICKUP, OrderType.DELIVERY),
        OrderStatus.DELIVERED,
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets the store mark an in-person PICKUP order as delivered (no driver involved)', () => {
    expect(() =>
      helpers.assertStatusTransitionAllowed(
        userOf(RolesKeys.STORE),
        orderOf(OrderStatus.READY_PICKUP, OrderType.PICKUP),
        OrderStatus.DELIVERED,
      ),
    ).not.toThrow();
  });

  it('lets the driver set ON_THE_WAY and DELIVERED', () => {
    for (const status of [OrderStatus.ON_THE_WAY, OrderStatus.DELIVERED]) {
      expect(() =>
        helpers.assertStatusTransitionAllowed(
          userOf(RolesKeys.DELIVERY),
          orderOf(OrderStatus.READY_PICKUP),
          status,
        ),
      ).not.toThrow();
    }
  });

  it('blocks the driver from setting PREPARING', () => {
    expect(() =>
      helpers.assertStatusTransitionAllowed(
        userOf(RolesKeys.DELIVERY),
        orderOf(OrderStatus.PENDING),
        OrderStatus.PREPARING,
      ),
    ).toThrow(ForbiddenException);
  });
});
