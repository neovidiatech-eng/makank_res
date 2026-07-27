// Unit tests for OrderService.bulkDeleteOrders — admin-only cleanup endpoint
// that hard-deletes orders and reverses wallet earnings for any that had
// already reached DELIVERED.
import { OrderStatus } from '@prisma/client';
import { OrderService } from '../order.service';

const buildService = (prisma: any, walletService: any = {}) =>
  new OrderService(
    prisma as any,
    undefined as any, // languages
    undefined as any, // helpers
    {
      reverseEarnings: jest.fn(),
      reverseCustomerRefund: jest.fn(),
      ...walletService,
    } as any, // walletService
    undefined as any, // paymentService
    undefined as any, // transactionService
    undefined as any, // notificationService
    undefined as any, // mapService
    undefined as any, // settingService
    undefined as any, // assignmentService
    undefined as any, // serviceHelper
    undefined as any, // kashierService
    undefined as any, // zoneService
    undefined as any, // afkBreakService
    undefined as any, // logsService
  );

describe('OrderService.bulkDeleteOrders', () => {
  it('deletes a non-DELIVERED order without touching wallets', async () => {
    const order = { id: 1, status: OrderStatus.CANCELLED };
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        delete: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn(async (cb: any) => cb(tx)) };
    const walletService = {
      reverseEarnings: jest.fn(),
      reverseCustomerRefund: jest.fn(),
    };
    const service = buildService(prisma, walletService);

    const result = await service.bulkDeleteOrders([1]);

    expect(walletService.reverseEarnings).not.toHaveBeenCalled();
    expect(walletService.reverseCustomerRefund).not.toHaveBeenCalled();
    expect(tx.order.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(result).toEqual({ deletedCount: 1, deletedIds: [1], failed: [] });
  });

  it('reverses the customer refund for a CANCELLED order that was paid + refunded', async () => {
    const order = {
      id: 3,
      status: OrderStatus.CANCELLED,
      paymentStatus: 'PAID',
      paidWithWallet: true,
    };
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        delete: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn(async (cb: any) => cb(tx)) };
    const walletService = {
      reverseEarnings: jest.fn(),
      reverseCustomerRefund: jest.fn(),
    };
    const service = buildService(prisma, walletService);

    await service.bulkDeleteOrders([3]);

    expect(walletService.reverseEarnings).not.toHaveBeenCalled();
    expect(walletService.reverseCustomerRefund).toHaveBeenCalledWith(order, tx);
  });

  it('does NOT reverse a customer refund for a CANCELLED order that was never paid/refunded', async () => {
    const order = {
      id: 4,
      status: OrderStatus.CANCELLED,
      paymentStatus: 'UNPAID',
    };
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        delete: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn(async (cb: any) => cb(tx)) };
    const walletService = {
      reverseEarnings: jest.fn(),
      reverseCustomerRefund: jest.fn(),
    };
    const service = buildService(prisma, walletService);

    await service.bulkDeleteOrders([4]);

    expect(walletService.reverseCustomerRefund).not.toHaveBeenCalled();
  });

  it('reverses earnings before deleting a DELIVERED order', async () => {
    const order = { id: 2, status: OrderStatus.DELIVERED, shipping: 20 };
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        delete: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn(async (cb: any) => cb(tx)) };
    const walletService = { reverseEarnings: jest.fn() };
    const service = buildService(prisma, walletService);

    const result = await service.bulkDeleteOrders([2]);

    expect(walletService.reverseEarnings).toHaveBeenCalledWith(order, tx);
    expect(tx.order.delete).toHaveBeenCalledWith({ where: { id: 2 } });
    expect(result.deletedIds).toEqual([2]);
  });

  it('collects per-order failures instead of aborting the whole batch', async () => {
    const goodOrder = { id: 10, status: OrderStatus.CANCELLED };
    let call = 0;
    const prisma = {
      $transaction: jest.fn(async (cb: any) => {
        call++;
        if (call === 1) {
          // id 1: order not found
          return cb({
            order: { findUnique: jest.fn().mockResolvedValue(null) },
          });
        }
        // id 10: succeeds
        return cb({
          order: {
            findUnique: jest.fn().mockResolvedValue(goodOrder),
            delete: jest.fn(),
          },
        });
      }),
    };
    const service = buildService(prisma);

    const result = await service.bulkDeleteOrders([1, 10]);

    expect(result.deletedCount).toBe(1);
    expect(result.deletedIds).toEqual([10]);
    expect(result.failed).toEqual([
      { id: 1, reason: 'Order 1 not found' },
    ]);
  });
});
