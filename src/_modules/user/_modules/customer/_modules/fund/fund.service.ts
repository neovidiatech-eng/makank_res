import { Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { TransactionService } from 'src/_modules/transaction/service/transaction.service';
import { PrismaService } from 'src/globals/services/prisma.service';
import { CreateFundDTO, FilterFundDTO } from './dto/fund.dto';
import { getFundArgs } from './prisma-args/fund.prisma-args';

import { NotificationService } from 'src/globals/services/notification.service';

@Injectable()
export class FundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionService: TransactionService,
    private readonly notificationService: NotificationService,
  ) {}
  async create(body: CreateFundDTO) {
    const fund = await this.prisma.fund.create({
      data: {
        ...body,
      },
    });
    await this.prisma.user.update({
      where: {
        id: body.customerId,
      },
      data: {
        Details: {
          update: {
            wallet: {
              increment: body.price,
            },
          },
        },
      },
    });

    await this.transactionService.createTransaction({
      userId: body.customerId,
      balance: body.price,
      referenceId: fund.id,
      type: TransactionType.FUND,
    });

    await this.notificationService.sendLocalizedNotification(
      body.customerId,
      {
        ar: 'تم إضافة رصيد',
        en: 'Fund Added',
      },
      {
        ar: 'تم إضافة رصيد إلي محفظتك',
        en: 'Your fund has been added to your wallet',
      },
    );
  }

  async getAll(filters: FilterFundDTO) {
    const args = getFundArgs(filters);
    const funds = await this.prisma.fund.findMany(args);
    return funds;
  }

  async count(filters: FilterFundDTO) {
    const args = getFundArgs(filters);
    return this.prisma.fund.count({ where: args.where });
  }
}
