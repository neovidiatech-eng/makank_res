import { forwardRef, Module } from '@nestjs/common';
import { GlobalHelpers } from 'src/globals/services/globalHelpers.service';
import { MapService } from 'src/globals/services/map.service';
import { NotificationService } from 'src/globals/services/notification.service';
import { TokenService } from '../authentication/services/jwt.service';
import { OTPService } from '../authentication/services/otp.service';
import { PaymentService } from '../payment/payment.service';
import { TransactionService } from '../transaction/service/transaction.service';
import { HelperService } from '../user/services/helper.service';
import { UserService } from '../user/services/user.service';
import { WalletService } from '../wallet/wallet.service';
import { OrderController } from './controllers/order.controller';
import { OrderStatisticsController } from './controllers/order.statistics.controller';
import { OrderTrackingGateway } from './gateways/order-tracking.gateway';
import { OrderService } from './order.service';
import { HelpersService } from './services/helpers.service';

import { OrderCronService } from './cron/order-cron.service';
import { AssignmentService } from './services/assignment.service';
import { AssignmentTimerService } from './services/timer.service';

import { LogsModule } from '../logs/logs.module';
import { KashierModule } from '../payment/kashier/kashier.module';
import { ServiceModule } from '../serviceModule/serviceModule.module';
import { ZoneModule } from '../zone/zone.module';

@Module({
  imports: [
    ServiceModule,
    forwardRef(() => KashierModule),
    ZoneModule,
    LogsModule,
  ],
  controllers: [OrderStatisticsController, OrderController],
  providers: [
    OrderService,
    HelpersService,
    GlobalHelpers,
    WalletService,
    PaymentService,
    UserService,
    TokenService,
    OTPService,
    HelperService,
    TransactionService,
    NotificationService,
    OrderCronService,
    MapService,
    AssignmentService,
    AssignmentTimerService,
    OrderTrackingGateway,
  ],
  exports: [
    OrderService,
    HelpersService,
    AssignmentService,
    AssignmentTimerService,
    OrderTrackingGateway,
  ],
})
export class OrderModule {}
