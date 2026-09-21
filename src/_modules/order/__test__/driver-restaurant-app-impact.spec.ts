import { WalletService } from '../../wallet/wallet.service';
import { getOrderArgs } from '../prisma-args/order.prisma.args';
import { OrderType } from '@prisma/client';

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
  adminCommission: 15,
  shipping: 15,
  originalShipping: 40,
  deliveryDiscount: 25,
  tax: 0,
  totalPriceAfterDiscount: 115, // 100 food + 15 shipping
  branchId: 7,
  deliveryId: 42,
  paymentMethod: 'CASH',
  isPartnerStore: true,
  type: OrderType.DELIVERY,
  invoice: {
    summary: {
      originalShippingFee: 40,
      deliveryDiscount: 25,
    },
  },
  ...overrides,
});

describe('Driver & Restaurant App Impact Verification', () => {
  describe('1. Driver Earnings with Promotional Delivery Subsidies', () => {
    it('ensures driver wallet receives full contractual fee (originalShipping: 40) when customer pays promo shipping (15)', async () => {
      const tx = buildTx();
      const walletService = new WalletService({} as any, {} as any);
      const order = buildOrder();

      await walletService.distributeEarnings(order as any, tx as any);

      // Driver wallet receives shipping (15) + promoSubsidy (25) = 40
      expect(tx.details.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 42 },
          update: expect.objectContaining({
            wallet: { increment: 40 },
          }),
        }),
      );

      // Admin wallet pays the delivery promo subsidy of 25 EGP:
      // adminCommission (15) - platformDeliverySubsidy (25) = -10
      expect(tx.adminWallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            totalEarning: { increment: -10 },
            currentBalance: { increment: -10 },
          }),
        }),
      );
    });

    it('ensures rollback correctly reverses subsidized driver earnings and admin subsidy deduction', async () => {
      const tx = buildTx();
      const walletService = new WalletService({} as any, {} as any);
      const order = buildOrder();

      await walletService.reverseEarnings(order as any, tx as any);

      // Driver wallet is decremented by 40 (15 + 25)
      expect(tx.details.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 42 },
          data: expect.objectContaining({
            wallet: { decrement: 40 },
          }),
        }),
      );

      // Admin wallet rollback reverses the subsidized commission: adminCommission (15) - subsidy (25) = -10
      expect(tx.adminWallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            totalEarning: { decrement: -10 },
            currentBalance: { decrement: -10 },
          }),
        }),
      );
    });
  });

  describe('2. Restaurant App Financial Net Earnings Isolation', () => {
    it('guarantees restaurant earnings are calculated strictly on items subtotal minus commission, fully isolated from delivery discounts', async () => {
      const tx = buildTx();
      const walletService = new WalletService({} as any, {} as any);

      // Case 1: Standard delivery without promo (food: 100, shipping: 40, commission: 10)
      const standardOrder = buildOrder({
        shipping: 40,
        originalShipping: 40,
        deliveryDiscount: 0,
        totalPriceAfterDiscount: 140, // 100 food + 40 shipping
        adminCommission: 10,
        invoice: { summary: { originalShippingFee: 40, deliveryDiscount: 0 } },
      });

      // Case 2: Promo delivery order (food: 100, shipping: 15, commission: 10, deliveryDiscount: 25)
      const promoOrder = buildOrder({
        shipping: 15,
        originalShipping: 40,
        deliveryDiscount: 25,
        totalPriceAfterDiscount: 115, // 100 food + 15 shipping
        adminCommission: 10,
        invoice: { summary: { originalShippingFee: 40, deliveryDiscount: 25 } },
      });

      // Execute standard order
      await walletService.distributeEarnings(standardOrder as any, tx as any);
      const standardStoreCall = tx.wallet.update.mock.calls[0][0];

      // Reset mock and execute promo order
      tx.wallet.update.mockClear();
      await walletService.distributeEarnings(promoOrder as any, tx as any);
      const promoStoreCall = tx.wallet.update.mock.calls[0][0];

      // Branch earnings MUST be identical: 100 - 10 = 90 in both cases!
      expect(standardStoreCall.data.totalEarning.increment).toBe(90);
      expect(promoStoreCall.data.totalEarning.increment).toBe(90);
      expect(standardStoreCall.data.total.increment).toBe(100);
      expect(promoStoreCall.data.total.increment).toBe(100);
    });
  });

  describe('3. Multi-City Order Query Isolation for Drivers and Dashboard', () => {
    it('safely scopes order query by cityId when passed as a valid number or string', () => {
      const argsNum = getOrderArgs({ cityId: 5 } as any, []);
      expect(argsNum.where.AND).toEqual(
        expect.arrayContaining([{ Zone: { cityId: 5 } }]),
      );

      const argsStr = getOrderArgs({ cityId: '12' as any } as any, []);
      expect(argsStr.where.AND).toEqual(
        expect.arrayContaining([{ Zone: { cityId: 12 } }]),
      );
    });

    it('ignores invalid or non-positive cityId values gracefully', () => {
      const argsNaN = getOrderArgs({ cityId: 'abc' as any } as any, []);
      const cityFilterInNaN = argsNaN.where.AND?.some((c: any) => c.Zone && 'cityId' in c.Zone);
      expect(cityFilterInNaN).toBe(false);

      const argsZero = getOrderArgs({ cityId: 0 as any } as any, []);
      const cityFilterInZero = argsZero.where.AND?.some((c: any) => c.Zone && 'cityId' in c.Zone);
      expect(cityFilterInZero).toBe(false);
    });
  });
});
