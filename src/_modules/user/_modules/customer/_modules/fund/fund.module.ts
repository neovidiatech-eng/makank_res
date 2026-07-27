import { Module } from '@nestjs/common';
import { TransactionService } from 'src/_modules/transaction/service/transaction.service';
import { FundController } from './fund.controller';
import { FundService } from './fund.service';

import { NotificationService } from 'src/globals/services/notification.service';

@Module({
  imports: [],
  controllers: [FundController],
  providers: [FundService, TransactionService, NotificationService],
})
export class FundModule {}
