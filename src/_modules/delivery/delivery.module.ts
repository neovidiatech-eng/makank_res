import { Module } from '@nestjs/common';
import { NotificationService } from 'src/globals/services/notification.service';
import { TokenService } from '../authentication/services/jwt.service';
import { OTPService } from '../authentication/services/otp.service';
import { OrderTrackingGateway } from '../order/gateways/order-tracking.gateway';
import { TransactionService } from '../transaction/service/transaction.service';
import { HelperService } from '../user/services/helper.service';
import { UserService } from '../user/services/user.service';
import { WalletService } from '../wallet/wallet.service';
import { DeliveryScheduleController } from './controllers/delivery.schedule.controller';
import { DriverCashSettlementController } from './controllers/driver-cash-settlement.controller';
import { DriverWithdrawController } from './controllers/driver-withdraw.controller';
import { DeliveryAvailabilityService } from './delivery-availability.service';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryWalletController } from './delivery.wallet.controller';
import { AfkBreakResumeService } from './services/afk-break-resume.service';
import { DeliveryScheduleCronService } from './services/delivery.schedule.cron.service';
import { DeliveryScheduleHelpersService } from './services/delivery.schedule.helper.service';
import { DriverCashSettlementService } from './services/driver-cash-settlement.service';
import { DriverWithdrawService } from './services/driver-withdraw.service';

import { LogsModule } from '../logs/logs.module';
import { OrderModule } from '../order/order.module';
import { KashierModule } from '../payment/kashier/kashier.module';
import { ServiceModule } from '../serviceModule/serviceModule.module';

@Module({
  imports: [ServiceModule, KashierModule, OrderModule, LogsModule],
  controllers: [
    // Registered before DeliveryController: its `GET /delivery/:id` route would
    // otherwise swallow the literal `/delivery/withdrawals` path (same reasoning as
    // fortune-wheel.controller.ts's static-before-:id route ordering).
    DriverWithdrawController,
    DriverCashSettlementController,
    DeliveryController,
    DeliveryWalletController,
    DeliveryScheduleController,
  ],
  providers: [
    DeliveryService,
    OTPService,
    TokenService,
    DeliveryAvailabilityService,
    WalletService,
    UserService,
    HelperService,
    NotificationService,
    DeliveryScheduleHelpersService,
    DeliveryScheduleCronService,
    AfkBreakResumeService,
    DriverWithdrawService,
    DriverCashSettlementService,
    TransactionService,
  ],
  exports: [DeliveryService],
})
export class DeliveryModule {}
