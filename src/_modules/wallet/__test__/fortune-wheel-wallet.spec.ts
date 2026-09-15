/**
 * fortune-wheel-wallet.spec.ts
 * Tests the fortune wheel 50/50 split logic in WalletService.distributeEarnings
 * and correct reversal in reverseEarnings.
 */
import { WalletService } from "../../wallet/wallet.service";

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
  totalPriceAfterDiscount: 100,
  branchId: 7,
  deliveryId: 42,
  paymentMethod: "CASH",
  isPartnerStore: true,
  type: "DELIVERY",
  invoice: { summary: {} },
  ...overrides,
});

describe("WalletService - Fortune Wheel earnings distribution", () => {

  describe("distributeEarnings() - fortune discount 50/50 split", () => {
    it("credits +50% fortuneDiscount to branch wallet when discount=20", async () => {
      const tx = buildTx();
      const service = new WalletService({} as any, {} as any);
      const order = buildOrder({
        invoice: { summary: { fortuneDiscount: 20 } },
      });

      await service.distributeEarnings(order, tx as any);

      // storeFortuneSubsidy = 20/2 = 10
      // branchEarning = totalPrice - adminCommission - shipping = 100 - 10 - 20 = 70
      // branch gets 70 + 10 = 80
      expect(tx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEarning: { increment: 80 },
            currentBalance: { increment: 80 },
          }),
        }),
      );
    });

    it("debits platformFortuneCost from admin when discount=20", async () => {
      const tx = buildTx();
      const service = new WalletService({} as any, {} as any);
      const order = buildOrder({
        invoice: { summary: { fortuneDiscount: 20 } },
      });

      await service.distributeEarnings(order, tx as any);

      // admin gets adminCommission - platformFortuneCost = 10 - 10 = 0
      expect(tx.adminWallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEarning: { increment: 0 },
            currentBalance: { increment: 0 },
          }),
        }),
      );
    });

    it("does NOT add fortune subsidy when fortuneDiscount=0", async () => {
      const tx = buildTx();
      const service = new WalletService({} as any, {} as any);
      const order = buildOrder({ invoice: { summary: {} } });

      await service.distributeEarnings(order, tx as any);

      // branchEarning = 100 - 10 - 20 = 70 (no subsidy added)
      expect(tx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEarning: { increment: 70 },
          }),
        }),
      );
    });

    it("credits full originalShippingFee to driver for free delivery order", async () => {
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

      // driver should get originalShippingFee=25, not shipping=0
      expect(tx.details.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            wallet: { increment: 25 },
          }),
        }),
      );
    });

    it("driver gets normal shipping when no free delivery fortune", async () => {
      const tx = buildTx();
      const service = new WalletService({} as any, {} as any);
      const order = buildOrder({ invoice: { summary: {} } });

      await service.distributeEarnings(order, tx as any);

      // driver gets regular shipping=20
      expect(tx.details.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            wallet: { increment: 20 },
          }),
        }),
      );
    });

    it("admin deducts both fortuneSubsidy AND freeDelivery cost from earnings", async () => {
      const tx = buildTx();
      const service = new WalletService({} as any, {} as any);
      const order = buildOrder({
        adminCommission: 15,
        shipping: 0,
        invoice: {
          summary: {
            fortuneDiscount: 20,
            isFreeDeliveryFortune: true,
            originalShippingFee: 25,
          },
        },
      });

      await service.distributeEarnings(order, tx as any);

      // storeFortuneSubsidy = 10, freeDeliveryDriverCost = 25
      // platformFortuneCost = 35
      // admin gets 15 - 35 = -20
      expect(tx.adminWallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEarning: { increment: -20 },
          }),
        }),
      );
    });
  });

  describe("reverseEarnings() - fortune wheel exact reversal", () => {
    it("reverses the 50% fortune subsidy from branch wallet", async () => {
      const tx = buildTx();
      const service = new WalletService({} as any, {} as any);
      const order = buildOrder({
        invoice: { summary: { fortuneDiscount: 20 } },
      });

      await service.reverseEarnings(order, tx as any);

      // branchEarning = 70, subsidy = 10 → decrement 80
      expect(tx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalEarning: { decrement: 80 },
            currentBalance: { decrement: 80 },
          }),
        }),
      );
    });

    it("reverses full originalShippingFee from driver wallet for free delivery", async () => {
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

      await service.reverseEarnings(order, tx as any);

      expect(tx.details.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            wallet: { decrement: 25 },
          }),
        }),
      );
    });
  });

});
