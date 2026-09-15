/**
 * fortune-wheel-wallet.spec.ts
 * Tests the deferred 50/50 Fortune Wheel discount settlement model:
 * - Store absorbs 100% of discount upfront in order earnings
 * - fortuneDiscount is accumulated in branch wallet (accumulatedFortuneDiscount)
 * - Admin settles and resets accumulated discount (Cash/Bank payout or Wallet credit)
 * - Correct reversal on order cancellation
 */
import { WalletService } from "../../wallet/wallet.service";

const buildTx = (overrides: Partial<any> = {}) => ({
  adminWallet: {
    findFirst: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn(),
  },
  wallet: { update: jest.fn() },
  details: { update: jest.fn(), upsert: jest.fn() },
  storeDiscountSettlement: { create: jest.fn() },
  ...overrides,
});

const buildOrder = (overrides: Partial<any> = {}) => ({
  adminCommission: 10,
  shipping: 20,
  tax: 5,
  totalPriceAfterDiscount: 100,
  branchId: 7,
  deliveryId: 42,
  paymentMethod: "CASH",
  isPartnerStore: true,
  type: "DELIVERY",
  invoice: { summary: {} },
  ...overrides,
});

describe("WalletService - Deferred Fortune Wheel discount settlement", () => {

  describe("distributeEarnings() - store bears discount upfront & accumulates ledger", () => {
    it("credits branch with net discounted earnings and increments accumulatedFortuneDiscount by full discount (20)", async () => {
      const tx = buildTx();
      const service = new WalletService({} as any, {} as any);
      const order = buildOrder({
        invoice: { summary: { fortuneDiscount: 20 } },
      });

      await service.distributeEarnings(order, tx as any);

      // Store bears discount upfront:
      // branchEarning = totalPrice - adminCommission - shipping = 100 - 10 - 20 = 70
      // accumulatedFortuneDiscount increments by full 20 EGP
      expect(tx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: 7 },
          data: expect.objectContaining({
            totalEarning: { increment: 70 },
            currentBalance: { increment: 70 },
            accumulatedFortuneDiscount: { increment: 20 },
          }),
        }),
      );
    });

    it("keeps admin commission intact at order time (subsidy deferred to end-of-period settlement)", async () => {
      const tx = buildTx();
      const service = new WalletService({} as any, {} as any);
      const order = buildOrder({
        invoice: { summary: { fortuneDiscount: 20 } },
      });

      await service.distributeEarnings(order, tx as any);

      // Admin gets full commission (no store subsidy deducted upfront)
      expect(tx.adminWallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEarning: { increment: 10 },
            currentBalance: { increment: 10 },
          }),
        }),
      );
    });

    it("does not increment accumulatedFortuneDiscount when fortuneDiscount=0", async () => {
      const tx = buildTx();
      const service = new WalletService({} as any, {} as any);
      const order = buildOrder({ invoice: { summary: {} } });

      await service.distributeEarnings(order, tx as any);

      expect(tx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEarning: { increment: 70 },
          }),
        }),
      );
      const updateData = (tx.wallet.update as jest.Mock).mock.calls[0][0].data;
      expect(updateData.accumulatedFortuneDiscount).toBeUndefined();
    });

    it("credits full originalShippingFee to driver for free delivery order and debits admin", async () => {
      const tx = buildTx();
      const service = new WalletService({} as any, {} as any);
      const order = buildOrder({
        shipping: 0,
        invoice: {
          summary: {
            isFreeDeliveryFortune: true,
            originalShippingFee: 25,
          },
        },
      });

      await service.distributeEarnings(order, tx as any);

      // driver gets originalShippingFee=25
      expect(tx.details.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            wallet: { increment: 25 },
          }),
        }),
      );

      // admin wallet debits the 25 EGP free delivery driver subsidy: 10 - 25 = -15
      expect(tx.adminWallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEarning: { increment: -15 },
          }),
        }),
      );
    });
  });

  describe("reverseEarnings() - exact reversal including accumulated discount", () => {
    it("reverses branch earnings and decrements accumulatedFortuneDiscount on order cancellation", async () => {
      const tx = buildTx();
      const service = new WalletService({} as any, {} as any);
      const order = buildOrder({
        invoice: { summary: { fortuneDiscount: 20 } },
      });

      await service.reverseEarnings(order, tx as any);

      expect(tx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEarning: { decrement: 70 },
            currentBalance: { decrement: 70 },
            accumulatedFortuneDiscount: { decrement: 20 },
          }),
        }),
      );
    });
  });

  describe("getStoreWalletSummary() - reporting accumulated discounts and 50% subsidy due", () => {
    it("returns accumulatedFortuneDiscount and pendingPlatformSubsidy (50%)", async () => {
      const prismaMock = {
        wallet: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: {
              currentBalance: 500,
              totalCommissionDeducted: 100,
              pendingWithdraw: 0,
              totalWithdrawn: 200,
              accumulatedFortuneDiscount: 400,
              settledFortuneDiscount: 800,
            },
          }),
        },
      };

      const service = new WalletService(prismaMock as any, {} as any);
      const summary = await service.getStoreWalletSummary(12);

      expect(summary.total).toBe(500);
      expect(summary.accumulatedFortuneDiscount).toBe(400);
      expect(summary.pendingPlatformSubsidy).toBe(200); // 50% of 400
      expect(summary.settledFortuneDiscount).toBe(800);
    });
  });

  describe("settleStoreFortuneDiscounts() - end of period 50/50 settlement & reset", () => {
    it("settles via CASH_BANK_PAYOUT: resets accumulated to 0, does not mutate currentBalance", async () => {
      const txMock = buildTx();
      const prismaMock = {
        branch: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 1,
              storeId: 10,
              Wallet: { branchId: 1, accumulatedFortuneDiscount: 600 },
            },
          ]),
        },
        $transaction: jest.fn((callback) => callback(txMock)),
      };

      const service = new WalletService(prismaMock as any, {} as any);
      const result = await service.settleStoreFortuneDiscounts(
        10,
        "Cash payout handed to owner",
        "CASH_BANK_PAYOUT",
      );

      expect(result.settledDiscounts).toBe(600);
      expect(result.platformSubsidyPaid).toBe(300); // 50% of 600

      // Resets accumulated discount and increments settled counter
      expect(txMock.wallet.update).toHaveBeenCalledWith({
        where: { branchId: 1 },
        data: {
          accumulatedFortuneDiscount: 0,
          settledFortuneDiscount: { increment: 600 },
        },
      });

      // Audit settlement created
      expect(txMock.storeDiscountSettlement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeId: 10,
          branchId: 1,
          totalDiscounts: 600,
          platformSubsidy: 300,
          settlementType: "CASH_BANK_PAYOUT",
          adminNote: "Cash payout handed to owner",
        }),
      });

      // Does NOT touch adminWallet or in-app currentBalance for external cash payout
      expect(txMock.adminWallet.update).not.toHaveBeenCalled();
    });

    it("settles via WALLET: credits 50% to store wallet and debits admin wallet", async () => {
      const txMock = buildTx();
      const prismaMock = {
        branch: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 1,
              storeId: 10,
              Wallet: { branchId: 1, accumulatedFortuneDiscount: 500 },
            },
          ]),
        },
        $transaction: jest.fn((callback) => callback(txMock)),
      };

      const service = new WalletService(prismaMock as any, {} as any);
      const result = await service.settleStoreFortuneDiscounts(
        10,
        "Deposit to store wallet",
        "WALLET",
      );

      expect(result.settledDiscounts).toBe(500);
      expect(result.platformSubsidyPaid).toBe(250);

      // Credits 50% (250) to store wallet currentBalance
      expect(txMock.wallet.update).toHaveBeenCalledWith({
        where: { branchId: 1 },
        data: {
          accumulatedFortuneDiscount: 0,
          settledFortuneDiscount: { increment: 500 },
          currentBalance: { increment: 250 },
          totalEarning: { increment: 250 },
        },
      });

      // Debits 250 from admin wallet
      expect(txMock.adminWallet.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          totalEarning: { decrement: 250 },
          currentBalance: { decrement: 250 },
        },
      });
    });
  });

});
