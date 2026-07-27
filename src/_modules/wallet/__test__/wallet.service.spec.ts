import { NotFoundException } from '@nestjs/common';
import { WalletService } from '../wallet.service';

const buildTx = (overrides: Partial<any> = {}) => ({
  adminWallet: {
    findFirst: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn(),
  },
  wallet: { update: jest.fn() },
  details: { update: jest.fn(), upsert: jest.fn() },
  ...overrides,
});

const buildOrder = (overrides: Partial<any> = {}) => ({
  adminCommission: 10,
  shipping: 20,
  tax: 5,
  totalPriceAfterDiscount: 200,
  branchId: 7,
  deliveryId: 42,
  paymentMethod: 'CASH',
  ...overrides,
});

describe('WalletService.reverseEarnings — exact inverse of distributeEarnings', () => {
  it('decrements admin, branch, and driver wallets by the same amounts distributeEarnings credited (CASH order)', async () => {
    const tx = buildTx();
    const service = new WalletService({} as any, {} as any);
    const order = buildOrder();

    await service.reverseEarnings(order, tx as any);

    expect(tx.adminWallet.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        totalEarning: { decrement: 10 },
        currentBalance: { decrement: 10 },
        total: { decrement: 10 },
      },
    });

    // branchEarning = totalPrice - adminCommission - shipping = 200 - 10 - 20 = 170
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { branchId: 7 },
      data: {
        totalEarning: { decrement: 170 },
        currentBalance: { decrement: 170 },
        total: { decrement: 200 - 20 },
        totalCommissionDeducted: { decrement: 10 },
      },
    });

    expect(tx.details.update).toHaveBeenCalledWith({
      where: { userId: 42 },
      data: {
        wallet: { decrement: 20 },
        collectedCash: { decrement: 200 },
        unsettledCommission: { decrement: 15 }, // adminCommission + tax
      },
    });
  });

  it('does not touch collectedCash/unsettledCommission for a non-CASH order', async () => {
    const tx = buildTx();
    const service = new WalletService({} as any, {} as any);
    const order = buildOrder({ paymentMethod: 'WALLET' });

    await service.reverseEarnings(order, tx as any);

    expect(tx.details.update).toHaveBeenCalledWith({
      where: { userId: 42 },
      data: { wallet: { decrement: 20 } },
    });
  });

  it('skips branch/driver updates when the order has no branchId/deliveryId', async () => {
    const tx = buildTx();
    const service = new WalletService({} as any, {} as any);
    const order = buildOrder({ branchId: null, deliveryId: null });

    await service.reverseEarnings(order, tx as any);

    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.details.update).not.toHaveBeenCalled();
  });
});

describe('WalletService.reverseCustomerRefund — inverse of refundOrder', () => {
  it('decrements the customer wallet by the refunded order total', async () => {
    const tx = { details: { update: jest.fn() } };
    const service = new WalletService({} as any, {} as any);

    await service.reverseCustomerRefund(
      { userId: 5, totalPriceAfterDiscount: 150 },
      tx as any,
    );

    expect(tx.details.update).toHaveBeenCalledWith({
      where: { userId: 5 },
      data: { wallet: { decrement: 150 } },
    });
  });

  it('does nothing when the order has no userId', async () => {
    const tx = { details: { update: jest.fn() } };
    const service = new WalletService({} as any, {} as any);

    await service.reverseCustomerRefund(
      { userId: null, totalPriceAfterDiscount: 150 },
      tx as any,
    );

    expect(tx.details.update).not.toHaveBeenCalled();
  });
});

describe('WalletService.resetDriverWallet', () => {
  it('zeroes every wallet field and denies pending withdrawals in one transaction', async () => {
    const detailsUpdate = { id: 'details-update' };
    const withdrawUpdateMany = { id: 'withdraw-update' };
    const prisma = {
      details: {
        findUnique: jest.fn().mockResolvedValue({ userId: 42, wallet: 500 }),
        update: jest.fn().mockReturnValue(detailsUpdate),
      },
      driverWithdraw: {
        updateMany: jest.fn().mockReturnValue(withdrawUpdateMany),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WalletService(prisma as any, {} as any);

    await service.resetDriverWallet(42);

    expect(prisma.details.update).toHaveBeenCalledWith({
      where: { userId: 42 },
      data: {
        wallet: 0,
        collectedCash: 0,
        unsettledCommission: 0,
        pendingWithdraw: 0,
        totalWithdrawn: 0,
      },
    });
    expect(prisma.driverWithdraw.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deliveryId: 42, status: 'PENDING' },
        data: expect.objectContaining({ status: 'DENIED' }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith([
      detailsUpdate,
      withdrawUpdateMany,
    ]);
  });

  it('throws NotFoundException when the driver has no Details row', async () => {
    const prisma = {
      details: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new WalletService(prisma as any, {} as any);

    await expect(service.resetDriverWallet(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
