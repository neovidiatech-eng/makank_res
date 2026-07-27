import { Module } from '@nestjs/common';
import { TokenService } from 'src/_modules/authentication/services/jwt.service';
import { OTPService } from 'src/_modules/authentication/services/otp.service';
import { AddressModule } from './_modules/address/address.module';
import { FundModule } from './_modules/fund/fund.module';
import { CustomerController } from './controllers/customer.controller';
import { CustomerCreateController } from './controllers/customer.create.controller';
import { CustomerCreateService } from './services/customer.create.service';
import { CustomerService } from './services/customer.service';

@Module({
  imports: [AddressModule, FundModule],
  controllers: [CustomerCreateController, CustomerController],
  providers: [CustomerService, CustomerCreateService, OTPService, TokenService],
  exports: [],
})
export class CustomerModule {}
