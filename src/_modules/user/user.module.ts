import { Module } from '@nestjs/common';

import { TokenService } from '../authentication/services/jwt.service';
import { OTPService } from '../authentication/services/otp.service';
import { WalletService } from '../wallet/wallet.service';
import { CustomerModule } from './_modules/customer/customer.module';
import { SpecialistModule } from './_modules/specialist/specialist.module';
import { MeController } from './controllers/me.controller';
import { MeWalletController } from './controllers/me.wallet.controller';
import { UserController } from './controllers/user.controller';
import { HelperService } from './services/helper.service';
import { UserService } from './services/user.service';

@Module({
  imports: [CustomerModule, SpecialistModule],
  controllers: [MeWalletController, MeController, UserController],
  providers: [
    UserService,
    OTPService,
    TokenService,
    HelperService,
    WalletService,
  ],
  exports: [UserService],
})
export class UserModule {}
