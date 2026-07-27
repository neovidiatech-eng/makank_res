import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TransactionType, WithdrawStatus } from '@prisma/client';
import { TransactionService } from 'src/_modules/transaction/service/transaction.service';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import {
  CreateDriverWithdrawDTO,
  FilterDriverWithdrawDTO,
  UpdateDriverWithdrawDTO,
} from '../dto/driver-withdraw.dto';
import {
  getDriverWithdrawArgs,
  getDriverWithdrawArgsWithSelect,
} from '../prisma-args/driver-withdraw.prisma.args';

@Injectable()
export class DriverWithdrawService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionService: TransactionService,
  ) {}

  // Driver-facing: request a withdrawal of part of their Details.wallet balance.
  // Mirrors WithdrawService.create() for stores — one PENDING request at a time,
  // amount locked into pendingWithdraw (not deducted from wallet) until resolved.
  async requestWithdraw(deliveryId: number, dto: CreateDriverWithdrawDTO) {
    const details = await this.prisma.details.findUnique({
      where: { userId: deliveryId },
    });
    if (!details) throw new NotFoundException('Driver wallet not found');
    if ((details.wallet ?? 0) < dto.amount) {
      throw new BadRequestException('Not enough balance');
    }

    const pending = await this.prisma.driverWithdraw.findFirst({
      where: { deliveryId, status: WithdrawStatus.PENDING },
    });
    if (pending) {
      throw new BadRequestException('Pending withdraw found');
    }

    const withdraw = await this.prisma.driverWithdraw.create({
      data: {
        deliveryId,
        amount: dto.amount,
        payoutMethod: dto.payoutMethod,
        payoutDetails: dto.payoutDetails,
      },
    });

    await this.prisma.details.update({
      where: { userId: deliveryId },
      data: { pendingWithdraw: { increment: dto.amount } },
    });

    return withdraw;
  }

  // Admin-facing: approve or deny a pending request.
  async resolve(id: number, dto: UpdateDriverWithdrawDTO) {
    const withdraw = await this.prisma.driverWithdraw.findUnique({
      where: { id },
    });
    if (!withdraw) throw new NotFoundException('Withdraw request not found');
    if (withdraw.status !== WithdrawStatus.PENDING) {
      throw new BadRequestException('Withdraw already processed');
    }

    await this.prisma.driverWithdraw.update({
      where: { id },
      data: {
        status: dto.status,
        adminNote: dto.adminNote,
        respondedAt: new Date(),
      },
    });

    await this.prisma.details.update({
      where: { userId: withdraw.deliveryId },
      data: {
        pendingWithdraw: { decrement: withdraw.amount },
        wallet: {
          decrement:
            dto.status === WithdrawStatus.APPROVED ? withdraw.amount : 0,
        },
        totalWithdrawn: {
          increment:
            dto.status === WithdrawStatus.APPROVED ? withdraw.amount : 0,
        },
      },
    });

    // Log the ledger entry only once money actually moves (approval) — logging
    // it at request time left a stale WITHDRAWAL record for denied requests,
    // where the driver's wallet was never touched.
    if (dto.status === WithdrawStatus.APPROVED) {
      await this.transactionService.createTransaction({
        deliveryId: withdraw.deliveryId,
        balance: withdraw.amount,
        referenceId: withdraw.id,
        type: TransactionType.WITHDRAWAL,
      });
    }
  }

  async findAll(filters: FilterDriverWithdrawDTO) {
    const args = getDriverWithdrawArgs(filters);
    const argsWithSelect = getDriverWithdrawArgsWithSelect();
    return this.prisma.driverWithdraw[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });
  }

  async count(filters: FilterDriverWithdrawDTO) {
    const args = getDriverWithdrawArgs(filters);
    return this.prisma.driverWithdraw.count({ where: args.where });
  }
}
