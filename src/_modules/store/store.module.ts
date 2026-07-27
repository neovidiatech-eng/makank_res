import { Module } from '@nestjs/common';
import { GlobalHelpers } from 'src/globals/services/globalHelpers.service';
import { NotificationService } from 'src/globals/services/notification.service';
import { TokenService } from '../authentication/services/jwt.service';
import { OTPService } from '../authentication/services/otp.service';
import { LanguagesService } from '../languages/languages.service';
import { ServiceModule } from '../serviceModule/serviceModule.module';
import { StoreTemplateModule } from '../store-template/store-template.module';
import { HelperService } from '../user/services/helper.service';
import { UserService } from '../user/services/user.service';
import { WalletService } from '../wallet/wallet.service';
import { ZoneModule } from '../zone/zone.module';
import { StoreController } from './controllers/store.controller';
import { StoreFavouriteController } from './controllers/store.favourite.controller';
import { StoreScheduleController } from './controllers/store.schedule.controller';
import { StoreWalletController } from './controllers/store.wallet.controller';
import { StoreScheduleCronService } from './cron/store-schedule-cron.service';
import { HelpersService } from './services/helpers.service';
import { StoreFavouriteService } from './services/store.favourite.service';
import { StoreNearestService } from './services/store.nearest.service';
import { ScheduleHelpersService } from './services/store.schedule.helper.service';
import { ScheduleService } from './services/store.schedule.service';
import { StoreService } from './services/store.service';

@Module({
  imports: [ServiceModule, ZoneModule, StoreTemplateModule],
  controllers: [
    StoreWalletController,
    StoreFavouriteController,
    StoreController,
    StoreScheduleController,
  ],
  providers: [
    WalletService,
    StoreService,
    StoreFavouriteService,
    StoreNearestService,
    LanguagesService,
    HelpersService,
    OTPService,
    UserService,
    TokenService,
    ScheduleHelpersService,
    ScheduleService,
    GlobalHelpers,
    HelperService,
    StoreScheduleCronService,
    NotificationService,
  ],
})
export class StoreModule {}
