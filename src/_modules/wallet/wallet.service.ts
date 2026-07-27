import { PrismaService } from 'src/globals/services/prisma.service';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WithdrawStatus } from '@prisma/client';
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

    // 1. Update Admin Wallet
    const adminWallet = await tx.adminWallet.findFirst();
    if (adminWallet) {
      await tx.adminWallet.update({
        where: { id: adminWallet.id },
        data: {
          totalEarning: { increment: adminCommission },
          currentBalance: { increment: adminCommission },
          total: { increment: adminCommission },
        },
      });
    }

    // 2. Update Branch Wallet
    if (order.branchId) {
      await tx.wallet.update({
        where: { branchId: order.branchId },
        data: {
          totalEarning: { increment: branchEarning },
          currentBalance: { increment: branchEarning },
          total: { increment: totalPrice - shipping },
          // Transparency figure only (see getStoreWalletSummary) — never subtracted
          // from currentBalance again, adminCommission above already excludes it.
          totalCommissionDeducted: { increment: adminCommission },
        },
      });
    }

    // 3. Update Delivery Driver Wallet
    if (order.deliveryId) {
      // `wallet` is now PURE cumulative delivery-fee earnings, regardless of
      // payment method — never netted against cash the driver is holding. Cash
      // custody (collectedCash) and the commission embedded in it
      // (unsettledCommission) are tracked entirely separately and only ever
      // move via an admin cash settlement (driver-cash-settlement.service.ts),
      // not via order completion. This is what lets the wallet screen show
      // "total held / commission owed / delivery earnings" as three independent
      // numbers instead of one net figure.
      const driverUpdateData: any = { wallet: { increment: shipping } };

      if (order.paymentMethod === 'CASH') {
        driverUpdateData.collectedCash = { increment: totalPrice };
        driverUpdateData.unsettledCommission = {
          increment: adminCommission + tax,
        };
      }

      await tx.details.upsert({
        where: { userId: order.deliveryId },
        update: driverUpdateData,
        create: {
          userId: order.deliveryId,
          wallet: shipping,
          collectedCash: order.paymentMethod === 'CASH' ? totalPrice : 0,
          unsettledCommission:
            order.paymentMethod === 'CASH' ? adminCommission + tax : 0,
        },
      });
    }
  }

  // Exact inverse of distributeEarnings() — used when an admin force-deletes
  // an order that had already reached DELIVERED (and so had already been
  // credited), so cleaning up test data doesn't leave phantom earnings
  // behind on the admin/branch/driver wallets. Deliberately does NOT clamp
  // at zero: if a driver already withdrew against these earnings, going
  // negative here is the accurate signal that admin owes a manual follow-up,
  // not something to silently hide. Does not touch the Transaction ledger —
  // that history is left intact on purpose (matches the existing wallet-reset
  // precedent), only the actual balances used everywhere else are reversed.
  async reverseEarnings(order: any, tx: Prisma.TransactionClient) {
    const adminCommission = order.adminCommission || 0;
    const shipping = order.shipping || 0;
    const tax = order.tax || 0;
    const totalPrice = order.totalPriceAfterDiscount;
    const branchEarning = totalPrice - adminCommission - shipping;

    const adminWallet = await tx.adminWallet.findFirst();
    if (adminWallet) {
      await tx.adminWallet.update({
        where: { id: adminWallet.id },
        data: {
          totalEarning: { decrement: adminCommission },
          currentBalance: { decrement: adminCommission },
          total: { decrement: adminCommission },
        },
      });
    }

    if (order.branchId) {
      await tx.wallet.update({
        where: { branchId: order.branchId },
        data: {
          totalEarning: { decrement: branchEarning },
          currentBalance: { decrement: branchEarning },
          total: { decrement: totalPrice - shipping },
          totalCommissionDeducted: { decrement: adminCommission },
        },
      });
    }

    if (order.deliveryId) {
      const driverUpdateData: any = { wallet: { decrement: shipping } };

      if (order.paymentMethod === 'CASH') {
        driverUpdateData.collectedCash = { decrement: totalPrice };
        driverUpdateData.unsettledCommission = {
          decrement: adminCommission + tax,
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

  // Driver wallet screen's three numbers: total cash currently held, the
  // commission/tax portion embedded in it (owed back on settlement), and
  // cumulative delivery-fee earnings (their own money, withdrawable).
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
    return {
      total: details?.collectedCash ?? 0,
      commission: details?.unsettledCommission ?? 0,
      delivery: details?.wallet ?? 0,
      pendingWithdraw: details?.pendingWithdraw ?? 0,
      totalWithdrawn: details?.totalWithdrawn ?? 0,
    };
  }

  // Store wallet screen's two numbers, summed across every branch of the
  // store (a store may have more than one branch, each with its own Wallet row).
  async getStoreWalletSummary(storeId: number) {
    const result = await this.prisma.wallet.aggregate({
      where: { Branch: { storeId } },
      _sum: {
        currentBalance: true,
        totalCommissionDeducted: true,
        pendingWithdraw: true,
        totalWithdrawn: true,
      },
    });
    return {
      total: result._sum.currentBalance ?? 0,
      commissionDeducted: result._sum.totalCommissionDeducted ?? 0,
      pendingWithdraw: result._sum.pendingWithdraw ?? 0,
      totalWithdrawn: result._sum.totalWithdrawn ?? 0,
    };
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
