import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

import { firstOrMany } from 'src/globals/helpers/first-or-many';

import { TransactionType, WithdrawStatus } from '@prisma/client';
import { TransactionService } from '../transaction/service/transaction.service';
import { WalletService } from '../wallet/wallet.service';
import {
  CreateWithdrawDTO,
  FilterWithdrawDTO,
  UpdateWithdrawDTO,
} from './dto/withdraw.dto';
import {
  getWithdrawArgs,
  getWithdrawArgsWithSelect,
} from './prisma-args/withdraw.prisma.args';

@Injectable()
export class WithdrawService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
  ) {}

  async create(body: CreateWithdrawDTO) {
    let branchId = body.branchId;
    if (!branchId && body.storeId) {
      const firstBranch = await this.prisma.branch.findFirst({
        where: { storeId: body.storeId },
        select: { id: true },
      });
      branchId = firstBranch?.id;
    }

    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }

    await this.checkBalance(body.amount, branchId);

    const detailsStr =
      typeof body.payoutDetails === 'object' && body.payoutDetails !== null
        ? JSON.stringify(body.payoutDetails)
        : String(body.payoutDetails || '');

    await this.prisma.withdraw.create({
      data: {
        branchId,
        amount: body.amount,
        payoutMethod: body.payoutMethod,
        payoutDetails: detailsStr,
      },
    });
    await this.prisma.wallet.update({
      where: {
        branchId,
      },
      data: {
        pendingWithdraw: {
          increment: body.amount,
        },
      },
    });
  }

  async update(id: Id, body: UpdateWithdrawDTO) {
    const isUpdated = await this.prisma.withdraw.findUnique({ where: { id } });
    if (isUpdated.status !== WithdrawStatus.PENDING) {
      throw new BadRequestException('Withdraw already processed');
    }
    await this.prisma.withdraw.update({ where: { id }, data: body });
    await this.walletService.updateWithdrawWallet(
      isUpdated.branchId,
      isUpdated.amount,
      body.status,
    );

    // Log the ledger entry only once money actually moves (approval) — logging
    // it at request time left a stale WITHDRAWAL record for denied requests,
    // where the wallet's currentBalance was never touched.
    if (body.status === WithdrawStatus.APPROVED) {
      await this.transactionService.createTransaction({
        branchId: isUpdated.branchId,
        balance: isUpdated.amount,
        referenceId: isUpdated.id,
        type: TransactionType.WITHDRAWAL,
      });
    }
  }

  async findAll(filters: FilterWithdrawDTO) {
    const args = getWithdrawArgs(filters);
    const argsWithSelect = getWithdrawArgsWithSelect();

    const data = await this.prisma.withdraw[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });
    return data;
  }
  async count(filters: FilterWithdrawDTO) {
    const args = getWithdrawArgs(filters);
    const total = await this.prisma.withdraw.count({ where: args.where });

    return total;
  }

  private async checkBalance(amount: number, branchId: number) {
    const store = await this.prisma.wallet.findUnique({ where: { branchId } });
    if (!store) {
      throw new NotFoundException('Branch wallet not found');
    }
    const availableBalance = Math.max(
      0,
      store.currentBalance - store.pendingWithdraw,
    );
    if (availableBalance < amount) {
      throw new BadRequestException(
        `Insufficient available balance. Available: ${availableBalance.toFixed(2)}, Requested: ${amount}`,
      );
    }
    const foundPendingWithdraw = await this.prisma.withdraw.findFirst({
      where: { branchId, status: WithdrawStatus.PENDING },
    });
    if (foundPendingWithdraw) {
      throw new BadRequestException('Pending withdraw found');
    }
  }
}
