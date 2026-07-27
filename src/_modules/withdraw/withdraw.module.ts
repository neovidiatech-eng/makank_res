import { Module } from '@nestjs/common';
import { TokenService } from '../authentication/services/jwt.service';
import { OTPService } from '../authentication/services/otp.service';
import { TransactionService } from '../transaction/service/transaction.service';
import { HelperService } from '../user/services/helper.service';
import { UserService } from '../user/services/user.service';
import { WalletService } from '../wallet/wallet.service';
import { WithdrawController } from './withdraw.controller';
import { WithdrawService } from './withdraw.service';

@Module({
  imports: [],
  controllers: [WithdrawController],
  providers: [
    WithdrawService,
    TransactionService,
    WalletService,
    UserService,
    TokenService,
    OTPService,
    HelperService,
  ],
})
export class WithdrawModule {}
