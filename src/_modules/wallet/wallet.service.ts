import { PrismaService } from 'src/globals/services/prisma.service';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  TransactionType,
  UserType,
  WithdrawStatus,
} from '@prisma/client';
import { UserService } from '../user/services/user.service';
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly user: UserService,
  ) {}

  async getWallet(userId: number) {
    // Queried directly (not through UserService.getUser's shared select object, which
    // only exposes wallet/points there and is reused by login/profile responses) so
    // adding driver-specific fields here can't change the shape of unrelated endpoints.
    return this.prisma.details.findUnique({
      where: { userId },
      select: {
        wallet: true,
        points: true,
        collectedCash: true,
        pendingWithdraw: true,
        totalWithdrawn: true,
      },
    });
  }

  private async walletBasedOnUser(branchId?: number) {
    let wallet;
    if (branchId === null) {
      wallet = await this.prisma.adminWallet.findFirst();
    }
    if (branchId) {
      wallet = await this.prisma.wallet.findUnique({
        where: {
          branchId,
        },
      });
    }
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async updateWithdrawWallet(
    branchId: number,
    price: number,
    status: WithdrawStatus,
  ) {
    await this.prisma.wallet.update({
      where: {
        branchId,
      },
      data: {
        pendingWithdraw: {
          decrement: price,
        },
        totalWithdrawn: {
          increment: status === WithdrawStatus.APPROVED ? price : 0,
        },
        currentBalance: {
          decrement: status === WithdrawStatus.APPROVED ? price : 0,
        },
      },
    });
  }

  async distributeEarnings(order: any, tx: Prisma.TransactionClient) {
    const adminCommission = order.adminCommission || 0;
    const shipping = order.shipping || 0;
    const tax = order.tax || 0;
    const totalPrice = order.totalPriceAfterDiscount;
    const branchEarning = totalPrice - adminCommission - shipping;
    const isPartnerStore = Boolean(
      order.isPartnerStore || order.Branch?.Store?.isPartner,
    );
    const discountAmount = Number(order.discountAmount || 0);
    const nonPartnerPaymentOption = order.nonPartnerPaymentOption;

    // Fortune Wheel breakdown from invoice summary
    const invoiceSummary = (order.invoice as any)?.summary || {};
    const fortuneDiscount = Number(invoiceSummary.fortuneDiscount || 0);
    const isFreeDeliveryFortune = Boolean(
      invoiceSummary.isFreeDeliveryFortune ||
      invoiceSummary.freeDelivery ||
      (order.type === 'DELIVERY' && shipping === 0 && (invoiceSummary.deliveryDiscount > 0 || (invoiceSummary.originalShippingFee != null && invoiceSummary.originalShippingFee > 0))),
    );
    const originalShippingFee = Number(
      invoiceSummary.originalShippingFee ??
        (invoiceSummary.deliveryDiscount != null
          ? shipping + Number(invoiceSummary.deliveryDiscount)
          : shipping),
    );

    // Free delivery cost is borne by the platform at order completion
    const freeDeliveryDriverCost =
      isFreeDeliveryFortune && originalShippingFee > 0
        ? originalShippingFee
        : 0;

    // 1. Update Admin Wallet (deducts freeDeliveryDriverCost if platform subsidized free delivery)
    const adminWallet = await tx.adminWallet.findFirst();
    if (adminWallet) {
      await tx.adminWallet.update({
        where: { id: adminWallet.id },
        data: {
          totalEarning: { increment: adminCommission - freeDeliveryDriverCost },
          currentBalance: { increment: adminCommission - freeDeliveryDriverCost },
          total: { increment: adminCommission - freeDeliveryDriverCost },
        },
      });
    }

    // 2. Update Branch Wallet:
    // Store absorbs 100% of the discount upfront in the order's earning.
    // The discount amount is accumulated in accumulatedFortuneDiscount for the 50/50 end-of-period settlement.
    if (order.branchId) {
      if (isPartnerStore) {
        await tx.wallet.update({
          where: { branchId: order.branchId },
          data: {
            totalEarning: { increment: branchEarning },
            currentBalance: { increment: branchEarning },
            total: { increment: totalPrice - shipping },
            totalCommissionDeducted: { increment: adminCommission },
            ...(fortuneDiscount > 0
              ? { accumulatedFortuneDiscount: { increment: fortuneDiscount } }
              : {}),
          },
        });
      } else {
        // Non-partner store: driver pays cash at counter.
        const nonPartnerExtra =
          discountAmount > 0 && nonPartnerPaymentOption === 'DISCOUNTED_PRICE'
            ? discountAmount
            : 0;
        const branchUpdateData: any = {};
        if (nonPartnerExtra > 0) {
          branchUpdateData.totalEarning = { increment: nonPartnerExtra };
          branchUpdateData.currentBalance = { increment: nonPartnerExtra };
          branchUpdateData.total = { increment: nonPartnerExtra };
        }
        if (fortuneDiscount > 0) {
          branchUpdateData.accumulatedFortuneDiscount = { increment: fortuneDiscount };
        }
        if (Object.keys(branchUpdateData).length > 0) {
          await tx.wallet.update({
            where: { branchId: order.branchId },
            data: branchUpdateData,
          });
        }
      }
    }

    // 3. Update Delivery Driver Wallet
    if (order.deliveryId) {
      // Delivery promo subsidy: the customer paid a discounted fee but the driver
      // always earns the full contractual (original) base price. The platform absorbs
      // the difference (deliveryDiscount) — deducted from admin wallet above.
      const promoSubsidy = Number(order.deliveryDiscount ?? 0);
      let driverEarnings = isFreeDeliveryFortune && originalShippingFee > 0
        ? originalShippingFee
        : shipping + promoSubsidy;

      // If non-partner store with discount and driver paid full price cash (FULL_PRICE),
      // the driver paid the discount out of pocket, so the platform reimburses the driver's wallet!
      if (!isPartnerStore && discountAmount > 0 && nonPartnerPaymentOption === 'FULL_PRICE') {
        driverEarnings += discountAmount;
      }

      const driverUpdateData: any = { wallet: { increment: driverEarnings } };

      if (order.paymentMethod === 'CASH' && !order.paidWithWallet) {
        driverUpdateData.collectedCash = { increment: totalPrice };
        const commissionDeducted = isPartnerStore
          ? Math.max(0, totalPrice - shipping)
          : adminCommission + tax;
        driverUpdateData.unsettledCommission = {
          increment: commissionDeducted,
        };
      }

      await tx.details.upsert({
        where: { userId: order.deliveryId },
        update: driverUpdateData,
        create: {
          userId: order.deliveryId,
          wallet: driverEarnings,
          collectedCash:
            order.paymentMethod === 'CASH' && !order.paidWithWallet
              ? totalPrice
              : 0,
          unsettledCommission:
            order.paymentMethod === 'CASH' && !order.paidWithWallet
              ? isPartnerStore
                ? Math.max(0, totalPrice - shipping)
                : adminCommission + tax
              : 0,
        },
      });
    }
  }

  async reverseEarnings(order: any, tx: Prisma.TransactionClient) {
    const adminCommission = order.adminCommission || 0;
    const shipping = order.shipping || 0;
    const tax = order.tax || 0;
    const totalPrice = order.totalPriceAfterDiscount;
    const branchEarning = totalPrice - adminCommission - shipping;
    const isPartnerStore = Boolean(
      order.isPartnerStore || order.Branch?.Store?.isPartner,
    );
    const discountAmount = Number(order.discountAmount || 0);
    const nonPartnerPaymentOption = order.nonPartnerPaymentOption;

    const invoiceSummary = (order.invoice as any)?.summary || {};
    const fortuneDiscount = Number(invoiceSummary.fortuneDiscount || 0);
    const isFreeDeliveryFortune = Boolean(
      invoiceSummary.isFreeDeliveryFortune ||
      invoiceSummary.freeDelivery ||
      (order.type === 'DELIVERY' && shipping === 0 && (invoiceSummary.deliveryDiscount > 0 || (invoiceSummary.originalShippingFee != null && invoiceSummary.originalShippingFee > 0))),
    );
    const originalShippingFee = Number(
      invoiceSummary.originalShippingFee ??
        (invoiceSummary.deliveryDiscount != null
          ? shipping + Number(invoiceSummary.deliveryDiscount)
          : shipping),
    );

    const freeDeliveryDriverCost =
      isFreeDeliveryFortune && originalShippingFee > 0
        ? originalShippingFee
        : 0;

    const adminWallet = await tx.adminWallet.findFirst();
    if (adminWallet) {
      await tx.adminWallet.update({
        where: { id: adminWallet.id },
        data: {
          totalEarning: { decrement: adminCommission - freeDeliveryDriverCost },
          currentBalance: { decrement: adminCommission - freeDeliveryDriverCost },
          total: { decrement: adminCommission - freeDeliveryDriverCost },
        },
      });
    }

    if (order.branchId) {
      if (isPartnerStore) {
        await tx.wallet.update({
          where: { branchId: order.branchId },
          data: {
            totalEarning: { decrement: branchEarning },
            currentBalance: { decrement: branchEarning },
            total: { decrement: totalPrice - shipping },
            totalCommissionDeducted: { decrement: adminCommission },
            ...(fortuneDiscount > 0
              ? { accumulatedFortuneDiscount: { decrement: fortuneDiscount } }
              : {}),
          },
        });
      } else {
        const nonPartnerExtra =
          discountAmount > 0 && nonPartnerPaymentOption === 'DISCOUNTED_PRICE'
            ? discountAmount
            : 0;
        const branchUpdateData: any = {};
        if (nonPartnerExtra > 0) {
          branchUpdateData.totalEarning = { decrement: nonPartnerExtra };
          branchUpdateData.currentBalance = { decrement: nonPartnerExtra };
          branchUpdateData.total = { decrement: nonPartnerExtra };
        }
        if (fortuneDiscount > 0) {
          branchUpdateData.accumulatedFortuneDiscount = { decrement: fortuneDiscount };
        }
        if (Object.keys(branchUpdateData).length > 0) {
          await tx.wallet.update({
            where: { branchId: order.branchId },
            data: branchUpdateData,
          });
        }
      }
    }

    if (order.deliveryId) {
      let driverEarnings = isFreeDeliveryFortune && originalShippingFee > 0
        ? originalShippingFee
        : shipping;
      if (!isPartnerStore && discountAmount > 0 && nonPartnerPaymentOption === 'FULL_PRICE') {
        driverEarnings += discountAmount;
      }

      const driverUpdateData: any = { wallet: { decrement: driverEarnings } };

      if (order.paymentMethod === 'CASH' && !order.paidWithWallet) {
        driverUpdateData.collectedCash = { decrement: totalPrice };
        const commissionDeducted = isPartnerStore
          ? Math.max(0, totalPrice - shipping)
          : adminCommission + tax;
        driverUpdateData.unsettledCommission = {
          decrement: commissionDeducted,
        };
      }

      await tx.details.update({
        where: { userId: order.deliveryId },
        data: driverUpdateData,
      });
    }
  }

  // Full reset for one driver — zeroes every wallet/cash-custody figure and
  // denies any still-PENDING withdrawal request (so it can't later be
  // approved against a balance that no longer backs it). Transaction ledger
  // history is left untouched on purpose, same as reverseEarnings above.
  async resetDriverWallet(deliveryId: number) {
    const details = await this.prisma.details.findUnique({
      where: { userId: deliveryId },
    });
    if (!details) {
      throw new NotFoundException('Driver wallet not found');
    }

    await this.prisma.$transaction([
      this.prisma.details.update({
        where: { userId: deliveryId },
        data: {
          wallet: 0,
          collectedCash: 0,
          unsettledCommission: 0,
          pendingWithdraw: 0,
          totalWithdrawn: 0,
        },
      }),
      this.prisma.driverWithdraw.updateMany({
        where: { deliveryId, status: WithdrawStatus.PENDING },
        data: {
          status: WithdrawStatus.DENIED,
          respondedAt: new Date(),
          adminNote: 'Auto-denied — driver wallet was reset by an admin',
        },
      }),
    ]);
  }

  // Settle and reset wallet for a non-partner store
  async settleNonPartnerStoreWallet(storeId: number, adminNote?: string) {
    const branches = await this.prisma.branch.findMany({
      where: { storeId },
      include: { Wallet: true },
    });

    if (!branches.length) {
      throw new NotFoundException('Store branches not found');
    }

    return this.prisma.$transaction(async (tx) => {
      let settledTotal = 0;
      for (const branch of branches) {
        if (!branch.Wallet) continue;
        const currentBalance = branch.Wallet.currentBalance || 0;
        if (currentBalance <= 0) continue;

        settledTotal += currentBalance;

        // Zero out current balance and record as withdrawn
        await tx.wallet.update({
          where: { branchId: branch.id },
          data: {
            currentBalance: 0,
            totalWithdrawn: { increment: currentBalance },
          },
        });

        // Record a transaction for audit trail
        await tx.transaction.create({
          data: {
            branchId: branch.id,
            storeId: storeId,
            userType: UserType.STORE,
            type: TransactionType.WITHDRAWAL,
            referenceId: storeId,
            debit: 0,
            credit: currentBalance,
            balance: 0,
          },
        });
      }
      return { settledAmount: settledTotal, storeId };
    });
  }

  // Driver wallet screen: Total cash held, commission/tax owed, withdrawable earnings,
  // PLUS explicit Offline (CASH) vs Online (CARD/WALLET) breakdown & net products price ONLY.
  async getDriverWalletSummary(userId: number) {
    const details = await this.prisma.details.findUnique({
      where: { userId },
      select: {
        wallet: true,
        collectedCash: true,
        unsettledCommission: true,
        pendingWithdraw: true,
        totalWithdrawn: true,
      },
    });

    const orders = await this.prisma.order.findMany({
      where: {
        deliveryId: userId,
        status: OrderStatus.DELIVERED,
      },
      select: {
        id: true,
        price: true,
        totalPriceAfterDiscount: true,
        shipping: true,
        adminCommission: true,
        tax: true,
        packagingFee: true,
        discountAmount: true,
        paymentMethod: true,
        paidWithWallet: true,
        isPartnerStore: true,
        Branch: {
          select: {
            Store: {
              select: {
                isPartner: true,
              },
            },
          },
        },
      },
    });

    let cashOfflineTotal = 0;
    let onlineTotal = 0;
    let offlineNormalTotal = 0;
    let offlinePartnerTotal = 0;
    let onlineNormalTotal = 0;
    let onlinePartnerTotal = 0;
    let productsPriceOffline = 0;
    let productsPriceOnline = 0;
    let productsPriceOfflineNormal = 0;
    let productsPriceOfflinePartner = 0;
    let productsPriceOnlineNormal = 0;
    let productsPriceOnlinePartner = 0;
    let adminCommissionOnly = 0;
    let partnerProductsDebt = 0;

    orders.forEach((o) => {
      const isPartner = Boolean(o.isPartnerStore || o.Branch?.Store?.isPartner);
      const isOffline = o.paymentMethod === 'CASH' && !o.paidWithWallet;
      const orderTotal = o.totalPriceAfterDiscount || 0;
      const productsOnly = Math.max(
        0,
        orderTotal - (o.shipping || 0) - (o.adminCommission || 0) - (o.tax || 0) - (o.packagingFee || 0),
      );

      adminCommissionOnly += (o.adminCommission || 0);

      if (isOffline) {
        cashOfflineTotal += orderTotal;
        productsPriceOffline += productsOnly;
        if (isPartner) {
          offlinePartnerTotal += orderTotal;
          productsPriceOfflinePartner += productsOnly;
          partnerProductsDebt += productsOnly;
        } else {
          offlineNormalTotal += orderTotal;
          productsPriceOfflineNormal += productsOnly;
        }
      } else {
        onlineTotal += orderTotal;
        productsPriceOnline += productsOnly;
        if (isPartner) {
          onlinePartnerTotal += orderTotal;
          productsPriceOnlinePartner += productsOnly;
        } else {
          onlineNormalTotal += orderTotal;
          productsPriceOnlinePartner += productsOnly;
        }
      }
    });

    const totalAdminDebt = details?.unsettledCommission ?? (adminCommissionOnly + partnerProductsDebt);

    return {
      total: details?.collectedCash ?? 0,
      totalCollectedCash: details?.collectedCash ?? 0,
      commission: totalAdminDebt,
      unsettledCommission: totalAdminDebt,
      delivery: details?.wallet ?? 0,
      deliveryFeeEarnings: details?.wallet ?? 0,
      pendingWithdraw: details?.pendingWithdraw ?? 0,
      totalWithdrawn: details?.totalWithdrawn ?? 0,
      financials: {
        driverEarnings: details?.wallet ?? 0,
        collectedCash: details?.collectedCash ?? 0,
        totalAdminDebt: totalAdminDebt,
        adminCommissionOnly,
        partnerProductsDebt,
        productsPriceOffline,
        productsPriceOnline,
        netProductsPriceTotal: productsPriceOffline + productsPriceOnline,
        deliveryFees: details?.wallet ?? 0,
        adminCommission: totalAdminDebt,
      },
      breakdown: {
        offline: {
          paymentGroup: 'OFFLINE (CASH)',
          totalOrdersAmount: cashOfflineTotal,
          productsPriceOnly: productsPriceOffline,
          normal: {
            label: 'كاش غير شريك',
            totalOrdersAmount: offlineNormalTotal,
            productsPriceOnly: productsPriceOfflineNormal,
          },
          partner: {
            label: 'أوفلاين شريك (كاش شريك)',
            totalOrdersAmount: offlinePartnerTotal,
            productsPriceOnly: productsPriceOfflinePartner,
          },
        },
        online: {
          paymentGroup: 'ONLINE (WALLET/CARD)',
          totalOrdersAmount: onlineTotal,
          productsPriceOnly: productsPriceOnline,
          normal: {
            label: 'أونلاين غير شريك',
            totalOrdersAmount: onlineNormalTotal,
            productsPriceOnly: productsPriceOnlineNormal,
          },
          partner: {
            label: 'أونلاين شريك',
            totalOrdersAmount: onlinePartnerTotal,
            productsPriceOnly: productsPriceOnlinePartner,
          },
        },
        netProductsPriceTotal: productsPriceOffline + productsPriceOnline,
      },
    };
  }

  // Driver Daily Financial & Order Statistics
  async getDriverDailyStatistics(userId: number, dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const orders = await this.prisma.order.findMany({
      where: {
        deliveryId: userId,
        status: OrderStatus.DELIVERED,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        id: true,
        price: true,
        totalPriceAfterDiscount: true,
        shipping: true,
        adminCommission: true,
        tax: true,
        packagingFee: true,
        discountAmount: true,
        paymentMethod: true,
        paidWithWallet: true,
        createdAt: true,
      },
    });

    let offlineOrdersCount = 0;
    let onlineOrdersCount = 0;
    let productsPriceOffline = 0;
    let productsPriceOnline = 0;
    let totalShippingEarnings = 0;
    let totalAdminCommission = 0;
    let totalTax = 0;
    let grandTotalCollected = 0;

    orders.forEach((o) => {
      const isOffline = o.paymentMethod === 'CASH' && !o.paidWithWallet;
      const orderTotal = o.totalPriceAfterDiscount || 0;
      const productsOnly = Math.max(
        0,
        orderTotal - (o.shipping || 0) - (o.adminCommission || 0) - (o.tax || 0) - (o.packagingFee || 0),
      );

      if (isOffline) {
        offlineOrdersCount++;
        productsPriceOffline += productsOnly;
      } else {
        onlineOrdersCount++;
        productsPriceOnline += productsOnly;
      }

      totalShippingEarnings += o.shipping || 0;
      totalAdminCommission += o.adminCommission || 0;
      totalTax += o.tax || 0;
      grandTotalCollected += orderTotal;
    });

    return {
      date: startOfDay.toISOString().split('T')[0],
      totalOrdersCount: orders.length,
      offlineOrdersCount,
      onlineOrdersCount,
      financialSummary: {
        productsPriceOffline,
        productsPriceOnline,
        totalProductsPriceOnly: productsPriceOffline + productsPriceOnline,
        totalShippingEarnings,
        totalAdminCommission,
        totalTax,
        grandTotalCollected,
      },
    };
  }

  // List of all delivered orders for the driver today/specified date with itemized costs
  async getDriverDailyOrders(userId: number, dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const orders = await this.prisma.order.findMany({
      where: {
        deliveryId: userId,
        status: OrderStatus.DELIVERED,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        Address: true,
        Customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        Branch: {
          select: {
            id: true,
            name: true,
            address: true,
            Store: {
              select: {
                id: true,
                name: true,
                logo: true,
                isPartner: true,
              },
            },
          },
        },
        OrderItems: {
          include: {
            Service: {
              select: {
                id: true,
                name: true,
                price: true,
                image: true,
                Category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            Size: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
            OrderItemAddons: {
              include: {
                Addon: {
                  select: {
                    id: true,
                    name: true,
                    price: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((o) => {
      const isPartner = Boolean(o.isPartnerStore || o.Branch?.Store?.isPartner);
      const isOffline = o.paymentMethod === 'CASH' && !o.paidWithWallet;
      const orderTotal = o.totalPriceAfterDiscount || 0;
      const productsOnly = Math.max(
        0,
        orderTotal - (o.shipping || 0) - (o.adminCommission || 0) - (o.tax || 0) - (o.packagingFee || 0),
      );

      const paymentGroup = isOffline
        ? isPartner
          ? 'OFFLINE_PARTNER'
          : 'OFFLINE_NORMAL'
        : isPartner
          ? 'ONLINE_PARTNER'
          : 'ONLINE_NORMAL';

      const paymentGroupLabel = isOffline
        ? isPartner
          ? 'أوفلاين شريك (كاش شريك)'
          : 'كاش غير شريك'
        : isPartner
          ? 'أونلاين شريك'
          : 'أونلاين غير شريك';

      return {
        orderId: o.id,
        createdAt: o.createdAt,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentGroup,
        paymentGroupLabel,
        isPartnerStore: isPartner,
        partnerStoreNotice: isPartner
          ? 'مطعم شريك - لا تدفع مبالغ للمطعم عند الاستلام'
          : null,
        financials: {
          productsPriceOnly: productsOnly,
          shippingFee: o.shipping || 0,
          adminCommission: o.adminCommission || 0,
          taxFee: o.tax || 0,
          packagingFee: o.packagingFee || 0,
          discountAmount: o.discountAmount || 0,
          totalPriceAfterDiscount: orderTotal,
          payToStoreAmount: isPartner ? 0 : Math.max(0, orderTotal - (o.shipping || 0) - (o.adminCommission || 0)),
        },
        customer: {
          id: o.Customer?.id,
          name: o.Customer?.name,
          phone: o.Customer?.phone,
        },
        store: {
          id: o.Branch?.Store?.id,
          name: o.Branch?.Store?.name,
          logo: o.Branch?.Store?.logo,
          branchAddress: o.Branch?.address,
          isPartner,
        },
        itemsCount: o.OrderItems.length,
        items: o.OrderItems.map((item) => ({
          itemId: item.id,
          serviceId: item.serviceId,
          serviceName: item.Service?.name,
          categoryName: item.Service?.Category?.name,
          sizeName: item.Size?.name,
          price: item.price,
          quantity: item.quantity,
          addons: item.OrderItemAddons.map((addon) => ({
            addonId: addon.addonId,
            addonName: addon.Addon?.name,
            price: addon.Addon?.price,
          })),
        })),
      };
    });
  }

  // Individual Order Itemized Financial & Product Breakdown
  async getOrderFinancialBreakdown(orderId: number) {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        Address: true,
        Customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        Branch: {
          select: {
            id: true,
            name: true,
            address: true,
            Store: {
              select: {
                id: true,
                name: true,
                logo: true,
                isPartner: true,
              },
            },
          },
        },
        OrderItems: {
          include: {
            Service: {
              select: {
                id: true,
                name: true,
                price: true,
                priceAfterDiscount: true,
                image: true,
                Category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            Size: {
              select: {
                id: true,
                name: true,
                price: true,
                priceAfterDiscount: true,
              },
            },
            OrderItemAddons: {
              include: {
                Addon: {
                  select: {
                    id: true,
                    name: true,
                    price: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!o) {
      throw new NotFoundException('Order not found');
    }

    const isPartner = Boolean((o as any).isPartnerStore || o.Branch?.Store?.isPartner);
    const isCustom = o.type === 'CUSTOM_DELIVERY' || Boolean((o as any).customDeliveryKind);
    const isOffline = o.paymentMethod === 'CASH' && !o.paidWithWallet;
    const orderTotal = o.totalPriceAfterDiscount || 0;

    let itemDiscounts = 0;
    if (Array.isArray(o.OrderItems)) {
      for (const item of o.OrderItems) {
        const orig = Number(
          item.Size?.price ?? item.Service?.price ?? item.price ?? 0,
        );
        const pad = Number(
          item.Size?.priceAfterDiscount ??
            item.Service?.priceAfterDiscount ??
            orig,
        );
        if (orig > pad) {
          itemDiscounts += (orig - pad) * (item.quantity ?? 1);
        }
      }
    }
    const totalDiscount = itemDiscounts + (o.discountAmount ?? 0);
    const storeCommission = o.storeCommission ?? 0;
    const globalCommission = o.globalCommission ?? 0;
    const excessStoreCommission = Math.max(0, storeCommission - totalDiscount);
    const effectiveAdminCommission =
      storeCommission > 0 || globalCommission > 0
        ? globalCommission + excessStoreCommission
        : (o.adminCommission ?? 0);

    const productsOnly =
      isPartner || isCustom
        ? 0
        : Math.max(
            0,
            orderTotal -
              (o.shipping || 0) -
              effectiveAdminCommission -
              (o.tax || 0) -
              (o.packagingFee || 0),
          );

    const paymentGroup = isOffline
      ? isPartner
        ? 'OFFLINE_PARTNER'
        : 'OFFLINE_NORMAL'
      : isPartner
        ? 'ONLINE_PARTNER'
        : 'ONLINE_NORMAL';

    const paymentGroupLabel = isOffline
      ? isPartner
        ? 'أوفلاين شريك (كاش شريك)'
        : 'كاش غير شريك'
      : isPartner
        ? 'أونلاين شريك'
        : 'أونلاين غير شريك';

    return {
      orderId: o.id,
      createdAt: o.createdAt,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentGroup,
      paymentGroupLabel,
      isPartnerStore: isPartner,
      partnerStoreNotice: isPartner
        ? 'مطعم شريك - لا تدفع مبالغ للمطعم عند الاستلام'
        : null,
      financials: {
        productsPriceOnly: productsOnly,
        productSubtotal: o.price ?? productsOnly,
        shippingFee: o.shipping || 0,
        driverEarnings: o.shipping || 0,
        adminCommission: effectiveAdminCommission,
        storeCommission: o.storeCommission || 0,
        serviceFee: o.globalCommission || 0,
        globalCommission: o.globalCommission || 0,
        taxFee: o.tax || 0,
        tax: o.tax || 0,
        packagingFee: o.packagingFee || 0,
        discountAmount: totalDiscount,
        totalPriceAfterDiscount: orderTotal,
        totalAmount: orderTotal,
        storeNetEarnings: productsOnly,
        payToStoreAmount: isPartner || isCustom ? 0 : productsOnly,
      },
      customer: {
        id: o.Customer?.id,
        name: o.Customer?.name,
        phone: o.Customer?.phone,
      },
      store: {
        id: o.Branch?.Store?.id,
        name: o.Branch?.Store?.name,
        logo: o.Branch?.Store?.logo,
        branchAddress: o.Branch?.address,
        isPartner,
      },
      items: o.OrderItems.map((item) => ({
        itemId: item.id,
        serviceId: item.serviceId,
        serviceName: item.Service?.name,
        categoryName: item.Service?.Category?.name,
        sizeName: item.Size?.name,
        price: item.price,
        quantity: item.quantity,
        addons: item.OrderItemAddons.map((addon) => ({
          addonId: addon.addonId,
          addonName: addon.Addon?.name,
          price: addon.Addon?.price,
        })),
      })),
    };
  }

  // Store wallet screen's numbers, summed across every branch of the
  // store (a store may have more than one branch, each with its own Wallet row).
  async getStoreWalletSummary(storeId: number) {
    const result = await this.prisma.wallet.aggregate({
      where: { Branch: { storeId } },
      _sum: {
        currentBalance: true,
        totalCommissionDeducted: true,
        pendingWithdraw: true,
        totalWithdrawn: true,
        accumulatedFortuneDiscount: true,
        settledFortuneDiscount: true,
      },
    });
    const accumulatedFortuneDiscount =
      result._sum.accumulatedFortuneDiscount ?? 0;
    return {
      total: result._sum.currentBalance ?? 0,
      commissionDeducted: result._sum.totalCommissionDeducted ?? 0,
      pendingWithdraw: result._sum.pendingWithdraw ?? 0,
      totalWithdrawn: result._sum.totalWithdrawn ?? 0,
      accumulatedFortuneDiscount,
      pendingPlatformSubsidy: accumulatedFortuneDiscount / 2,
      settledFortuneDiscount: result._sum.settledFortuneDiscount ?? 0,
    };
  }

  /**
   * Settles accumulated fortune discounts for a store at the end of the period.
   * By default: External settlement (Cash / Bank payout):
   * Admin records that 50% was handed over in cash or bank transfer to store,
   * resets `accumulatedFortuneDiscount` to 0 without mutating in-app currentBalance,
   * increments `settledFortuneDiscount`, and creates a StoreDiscountSettlement audit record.
   */
  async settleStoreFortuneDiscounts(
    storeId: number,
    adminNote?: string,
    payoutMethod: 'CASH_BANK_PAYOUT' | 'WALLET' = 'CASH_BANK_PAYOUT',
  ) {
    const branches = await this.prisma.branch.findMany({
      where: { storeId },
      include: { Wallet: true },
    });

    if (!branches.length) {
      throw new NotFoundException('Store branches not found');
    }

    return this.prisma.$transaction(async (tx) => {
      let totalDiscounts = 0;
      let totalPlatformSubsidy = 0;

      for (const branch of branches) {
        if (!branch.Wallet) continue;
        const accumulated = branch.Wallet.accumulatedFortuneDiscount || 0;
        if (accumulated <= 0) continue;

        const platformSubsidy = accumulated / 2;
        totalDiscounts += accumulated;
        totalPlatformSubsidy += platformSubsidy;

        const walletUpdate: any = {
          accumulatedFortuneDiscount: 0,
          settledFortuneDiscount: { increment: accumulated },
        };

        if (payoutMethod === 'WALLET') {
          walletUpdate.currentBalance = { increment: platformSubsidy };
          walletUpdate.totalEarning = { increment: platformSubsidy };
        }

        await tx.wallet.update({
          where: { branchId: branch.id },
          data: walletUpdate,
        });

        await (tx as any).storeDiscountSettlement.create({
          data: {
            storeId,
            branchId: branch.id,
            totalDiscounts: accumulated,
            platformSubsidy,
            settlementType: payoutMethod,
            adminNote: adminNote || null,
          },
        });
      }

      if (payoutMethod === 'WALLET' && totalPlatformSubsidy > 0) {
        const adminWallet = await tx.adminWallet.findFirst();
        if (adminWallet) {
          await tx.adminWallet.update({
            where: { id: adminWallet.id },
            data: {
              totalEarning: { decrement: totalPlatformSubsidy },
              currentBalance: { decrement: totalPlatformSubsidy },
            },
          });
        }
      }

      return {
        storeId,
        settledDiscounts: totalDiscounts,
        platformSubsidyPaid: totalPlatformSubsidy,
        payoutMethod,
        message: 'Store fortune discounts settled and reset successfully',
      };
    });
  }

  async checkWalletBalance(userId: number, amount: number) {
    const user = await this.user.getUser(userId);
    if (user.Details.wallet < amount) {
      throw new BadRequestException('Insufficient balance');
    }
  }

  async deductUserBalance(
    userId: number,
    amount: number,
    tx: Prisma.TransactionClient,
  ) {
    const details = await tx.details.findUnique({
      where: { userId },
    });

    if (!details) {
      throw new BadRequestException('Wallet not found');
    }
    if (details.wallet < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    await tx.details.update({
      where: { userId },
      data: {
        wallet: {
          decrement: amount,
        },
      },
    });
  }

  async addUserBalance(
    userId: number,
    amount: number,
    tx: Prisma.TransactionClient,
  ) {
    await tx.details.upsert({
      where: { userId },
      update: {
        wallet: {
          increment: amount,
        },
      },
      create: {
        userId,
        wallet: amount,
      },
    });
  }
  // Branch/admin wallets are only ever credited once, at DELIVERED (see
  // distributeEarnings below) — a cancelled order never reached DELIVERED, so
  // they were never credited in the first place and there is nothing to
  // reverse here. Only the customer (who may have paid upfront) gets refunded.
  async refundOrder(order: any, tx: Prisma.TransactionClient) {
    if (order.userId) {
      await this.addUserBalance(
        order.userId,
        order.totalPriceAfterDiscount,
        tx,
      );
    }
  }

  // Inverse of refundOrder() — used when force-deleting a CANCELLED order
  // that had already been refunded to the customer (see the trigger
  // condition in bulkDeleteOrders), so wiping it out doesn't leave a phantom
  // credit on the customer's wallet. Deliberately uses a plain decrement
  // (not deductUserBalance's checked version) — it must never throw just
  // because the customer already spent the refund elsewhere.
  async reverseCustomerRefund(order: any, tx: Prisma.TransactionClient) {
    if (!order.userId) return;
    await tx.details.update({
      where: { userId: order.userId },
      data: { wallet: { decrement: order.totalPriceAfterDiscount } },
    });
  }
}
