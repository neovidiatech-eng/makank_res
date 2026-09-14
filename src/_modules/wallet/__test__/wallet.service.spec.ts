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
  isPartnerStore: true,
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
        unsettledCommission: { decrement: 180 }, // totalPrice - shipping for partner store
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

describe('WalletService — Non-Partner Store Handling', () => {
  it('does NOT credit store wallet for regular non-partner order without discount', async () => {
    const tx = buildTx();
    const service = new WalletService({} as any, {} as any);
    const order = buildOrder({
      isPartnerStore: false,
      discountAmount: 0,
      shipping: 20,
    });

    await service.distributeEarnings(order, tx as any);

    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.details.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42 },
        update: expect.objectContaining({ wallet: { increment: 20 } }),
      }),
    );
  });

  it('credits driver wallet with discount reimbursement when driver paid FULL_PRICE at non-partner store', async () => {
    const tx = buildTx();
    const service = new WalletService({} as any, {} as any);
    const order = buildOrder({
      isPartnerStore: false,
      discountAmount: 25,
      nonPartnerPaymentOption: 'FULL_PRICE',
      shipping: 20,
    });

    await service.distributeEarnings(order, tx as any);

    // Store wallet is not touched
    expect(tx.wallet.update).not.toHaveBeenCalled();
    // Driver wallet gets shipping (20) + discount reimbursement (25) = 45
    expect(tx.details.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42 },
        update: expect.objectContaining({ wallet: { increment: 45 } }),
      }),
    );
  });

  it('credits store wallet with discount when driver paid DISCOUNTED_PRICE at non-partner store', async () => {
    const tx = buildTx();
    const service = new WalletService({} as any, {} as any);
    const order = buildOrder({
      isPartnerStore: false,
      discountAmount: 25,
      nonPartnerPaymentOption: 'DISCOUNTED_PRICE',
      shipping: 20,
    });

    await service.distributeEarnings(order, tx as any);

    // Store wallet receives the discount difference (25)
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { branchId: 7 },
      data: {
        totalEarning: { increment: 25 },
        currentBalance: { increment: 25 },
        total: { increment: 25 },
      },
    });
    // Driver wallet only receives shipping (20)
    expect(tx.details.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42 },
        update: expect.objectContaining({ wallet: { increment: 20 } }),
      }),
    );
  });

  it('settleNonPartnerStoreWallet zeroes currentBalance and creates withdrawal transaction', async () => {
    const tx = {
      wallet: { update: jest.fn().mockResolvedValue({}) },
      transaction: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      branch: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, Wallet: { currentBalance: 150 } },
        ]),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(tx);
      }),
    };
    const service = new WalletService(prisma as any, {} as any);

    const res = await service.settleNonPartnerStoreWallet(1);

    expect(res.settledAmount).toBe(150);
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { branchId: 10 },
      data: {
        currentBalance: 0,
        totalWithdrawn: { increment: 150 },
      },
    });
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        branchId: 10,
        storeId: 1,
        credit: 150,
        balance: 0,
      }),
    });
  });

  it('reverseEarnings decrements driver wallet including discount reimbursement for non-partner FULL_PRICE order', async () => {
    const tx = buildTx();
    const service = new WalletService({} as any, {} as any);
    const order = buildOrder({
      isPartnerStore: false,
      discountAmount: 30,
      nonPartnerPaymentOption: 'FULL_PRICE',
      shipping: 20,
    });

    await service.reverseEarnings(order, tx as any);

    // Store wallet is not touched on reversal
    expect(tx.wallet.update).not.toHaveBeenCalled();
    // Driver wallet decremented by shipping (20) + discount (30) = 50
    expect(tx.details.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42 },
        data: expect.objectContaining({
          wallet: { decrement: 50 },
        }),
      }),
    );
  });

  it('reverseEarnings decrements store wallet when non-partner DISCOUNTED_PRICE order is reversed', async () => {
    const tx = buildTx();
    const service = new WalletService({} as any, {} as any);
    const order = buildOrder({
      isPartnerStore: false,
      discountAmount: 30,
      nonPartnerPaymentOption: 'DISCOUNTED_PRICE',
      shipping: 20,
    });

    await service.reverseEarnings(order, tx as any);

    // Store wallet decremented by discount (30)
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { branchId: 7 },
      data: {
        totalEarning: { decrement: 30 },
        currentBalance: { decrement: 30 },
        total: { decrement: 30 },
      },
    });
    // Driver wallet only decremented by shipping (20)
    expect(tx.details.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42 },
        data: expect.objectContaining({
          wallet: { decrement: 20 },
        }),
      }),
    );
  });

  it('settleNonPartnerStoreWallet handles 0 balance gracefully without making updates', async () => {
    const tx = {
      wallet: { update: jest.fn() },
      transaction: { create: jest.fn() },
    };
    const prisma = {
      branch: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, Wallet: { currentBalance: 0 } },
          { id: 11, Wallet: null },
        ]),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(tx);
      }),
    };
    const service = new WalletService(prisma as any, {} as any);

    const res = await service.settleNonPartnerStoreWallet(1);

    expect(res.settledAmount).toBe(0);
    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('settleNonPartnerStoreWallet throws NotFoundException when store has no branches', async () => {
    const prisma = {
      branch: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new WalletService(prisma as any, {} as any);

    await expect(service.settleNonPartnerStoreWallet(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

