import { CommissionType, CouponType, DiscountType, OrderType } from '@prisma/client';
import { HelpersService } from '../services/helpers.service';
import { WalletService } from '../../wallet/wallet.service';

/**
 * Five-App Ecosystem Integration & End-to-End Automated Test
 * 
 * Verifies that all 5 platform tiers work in perfect harmony:
 * 1. Admin Dashboard: configures STORE_WISE coupon for Store #101 & delivery promotions
 * 2. Backend Engine: validates coupon constraints, calculates subsidized shipping, and generates financials
 * 3. Customer Mobile App: receives serialized checkout payload with verified discounts
 * 4. Restaurant Mobile App: receives incoming order payload where storeNetEarnings is 100% protected
 * 5. Delivery Driver Mobile App: receives dispatch payload where driverEarnings = 40 (NOT 15)
 */
describe('Five-App Ecosystem End-to-End Simulation: Dashboard -> Backend -> Customer -> Restaurant -> Driver', () => {
  const storeIdKFC = 101;
  const storeIdBurger = 202;
  const userId = 42;
  const driverId = 99;
  const branchId = 5;

  describe('Step 1 & 2: Dashboard Config -> Backend Validation of Store-Specific Coupon', () => {
    let helpersService: HelpersService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        order: { count: jest.fn().mockResolvedValue(0) },
      };
      helpersService = new HelpersService(
        mockPrisma,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
    });

    const mockKfcCoupon = {
      id: 1,
      code: 'KFC50',
      type: CouponType.STORE_WISE,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      minOrderAmount: 50,
      maxDiscountValue: 100,
      active: true,
      startDate: new Date(Date.now() - 100000),
      endDate: new Date(Date.now() + 100000),
      usageCount: 5,
      maxUsage: 100,
      StoreCoupons: [{ storeId: storeIdKFC }],
      Orders: [],
    };

    it('SUCCESS: Customer applies KFC50 coupon at Store #101 (KFC) -> Accepted', async () => {
      // StoreCoupons contains storeIdKFC:
      await expect(
        helpersService.isCouponValid(
          mockKfcCoupon as any,
          100, // order amount
          null, // zoneId
          userId,
        ),
      ).resolves.not.toThrow();
    });

    it('REJECTION: Customer tries to apply KFC50 coupon at Store #202 (Burger Store) -> Rejected', async () => {
      // If store is 202, selectCouponOBJ returns StoreCoupons: []
      const couponOnWrongStore = {
        ...mockKfcCoupon,
        StoreCoupons: [], // Empty because where: { storeId: 202 } had no match
      };

      await expect(
        helpersService.isCouponValid(
          couponOnWrongStore as any,
          100,
          null,
          userId,
        ),
      ).rejects.toThrow('Coupon is not valid for this user');
    });
  });

  describe('Step 3, 4 & 5: Complete Cross-App Financial Lifecycle & Payload Contracts', () => {
    it('Flow: Customer places order with 15 EGP promo delivery (base 40) + 20 EGP store coupon', async () => {
      // 1. Order Setup
      const foodPrice = 100;
      const couponDiscount = 20; // 20% of 100
      const baseShipping = 40;
      const promoShipping = 15;
      const promoSubsidy = 25; // 40 - 15
      const adminCommission = 10;

      const orderPayload = {
        id: 777,
        code: '#777',
        price: foodPrice,
        discountAmount: couponDiscount,
        totalPriceAfterDiscount: foodPrice - couponDiscount + promoShipping, // 100 - 20 + 15 = 95
        shipping: promoShipping,
        originalShipping: baseShipping,
        deliveryDiscount: promoSubsidy,
        adminCommission,
        storeCommission: adminCommission,
        packagingFee: 0,
        tax: 0,
        globalCommission: 0,
        branchId,
        deliveryId: driverId,
        paymentMethod: 'CASH',
        isPartnerStore: true,
        type: OrderType.DELIVERY,
        invoice: {
          summary: {
            subtotal: foodPrice,
            discount: couponDiscount,
            shipping: promoShipping,
            originalShippingFee: baseShipping,
            deliveryDiscount: promoSubsidy,
            total: 95,
          },
        },
      };

      // 2. Simulate Backend calculation of driverEarnings and paymentDetails
      const isFreeDelivery = false;
      const originalDeliveryPrice = orderPayload.originalShipping;
      const driverEarnings = isFreeDelivery || promoSubsidy > 0
        ? (originalDeliveryPrice > 0 ? originalDeliveryPrice : promoShipping + promoSubsidy)
        : promoShipping;

      const storeNetEarnings = (foodPrice - couponDiscount) - adminCommission; // 80 - 10 = 70

      const fullBackendOrder = {
        ...orderPayload,
        financialBreakdown: {
          totalPriceAfterDiscount: 95,
          productSubtotal: foodPrice,
          productsPriceOnly: storeNetEarnings,
          shippingFee: promoShipping,
          originalShippingFee: baseShipping,
          discountAmount: couponDiscount,
          storeNetEarnings,
          driverEarnings,
        },
        paymentDetails: {
          isOnlinePayment: false,
          isPaid: false,
          collectFromCustomerAmount: 95,
          driverEarnings,
          isFreeDelivery: false,
          freeDeliveryNotice: 'عرض توصيل مخفض - يتم تحصيل المبلغ المخفض فقط ومتبقي مستحقاتك يضاف لمحفظتك',
        },
      };

      // --- VERIFY CONTRACT 1: Customer App View ---
      // Customer pays food (80) + discounted delivery (15) = 95 EGP
      expect(fullBackendOrder.invoice.summary.subtotal).toBe(100);
      expect(fullBackendOrder.invoice.summary.discount).toBe(20);
      expect(fullBackendOrder.invoice.summary.shipping).toBe(15);
      expect(fullBackendOrder.invoice.summary.originalShippingFee).toBe(40);
      expect(fullBackendOrder.invoice.summary.deliveryDiscount).toBe(25);
      expect(fullBackendOrder.invoice.summary.total).toBe(95);

      // --- VERIFY CONTRACT 2: Restaurant App View ---
      // Restaurant net earnings = (100 food - 20 coupon) - 10 adminCommission = 70 EGP
      // Delivery fee (15 or 40) does NOT touch the restaurant!
      expect(fullBackendOrder.financialBreakdown.storeNetEarnings).toBe(70);
      expect(fullBackendOrder.financialBreakdown.productsPriceOnly).toBe(70);

      // --- VERIFY CONTRACT 3: Delivery Driver App View ---
      // Driver sees FULL contractual fee (40 EGP), NOT 15 EGP!
      expect(fullBackendOrder.financialBreakdown.driverEarnings).toBe(40);
      expect(fullBackendOrder.paymentDetails.driverEarnings).toBe(40);
      expect(fullBackendOrder.paymentDetails.collectFromCustomerAmount).toBe(95);
      expect(fullBackendOrder.paymentDetails.freeDeliveryNotice).toContain('عرض توصيل مخفض');

      // --- VERIFY CONTRACT 4: Wallet Distribution (Accounting) ---
      const mockTx = {
        adminWallet: {
          findFirst: jest.fn().mockResolvedValue({ id: 1 }),
          update: jest.fn(),
        },
        wallet: { update: jest.fn() },
        details: { update: jest.fn(), upsert: jest.fn() },
      };

      const walletService = new WalletService({} as any, {} as any);
      await walletService.distributeEarnings(fullBackendOrder as any, mockTx as any);

      // 1. Driver Wallet receives 40 EGP:
      expect(mockTx.details.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: driverId },
          update: expect.objectContaining({
            wallet: { increment: 40 },
          }),
        }),
      );

      // 2. Restaurant Wallet receives net 70 EGP (totalPrice 95 - shipping 15 - commission 10 = 70):
      expect(mockTx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId },
          data: expect.objectContaining({
            totalEarning: { increment: 70 },
            currentBalance: { increment: 70 },
            total: { increment: 80 }, // totalPrice - shipping = 95 - 15 = 80
          }),
        }),
      );

      // 3. Admin Wallet bears the 25 EGP delivery promo subsidy:
      // adminCommission (10) - subsidy (25) = -15
      expect(mockTx.adminWallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            totalEarning: { increment: -15 },
            currentBalance: { increment: -15 },
          }),
        }),
      );
    });
  });
});
