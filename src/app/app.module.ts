import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { BullModule } from '@nestjs/bull';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';
import { AuthenticationModule } from 'src/_modules/authentication/authentication.module';
import { AuthorizationModule } from 'src/_modules/authorization/authorization.module';
import { BannerModule } from 'src/_modules/banner/banner.module';
import { BranchModule } from 'src/_modules/branch/branch.module';
import { CategoryModule } from 'src/_modules/category/category.module';
import { CityModule } from 'src/_modules/city/city.module';
import { ComplaintModule } from 'src/_modules/complaint/complaint.module';
import { CouponModule } from 'src/_modules/coupon/coupon.module';
import { DeliveryModule } from 'src/_modules/delivery/delivery.module';
import { FilterModule } from 'src/_modules/filter/filter.modules';
import { KeyValueModule } from 'src/_modules/keyValue/keyValue.module';
import { LanguagesModule } from 'src/_modules/languages/languages.module';
import { MediaModule } from 'src/_modules/media/media.module';
import { OrderModule } from 'src/_modules/order/order.module';
import { KashierModule } from 'src/_modules/payment/kashier/kashier.module';
import { RatingModule } from 'src/_modules/rating/rating.module';
import { ServiceModule } from 'src/_modules/serviceModule/serviceModule.module';
import { SettingsModule } from 'src/_modules/settings/settings.module';
import { SocialMediaModule } from 'src/_modules/social-media/social-media.module';
import { StatisticsModule } from 'src/_modules/statistics/statistics.module';
import { StoreModule } from 'src/_modules/store/store.module';
import { SystemNotificationModule } from 'src/_modules/system-notification/system-notification.module';
import { TransactionModule } from 'src/_modules/transaction/transaction.module';
import { UserModule } from 'src/_modules/user/user.module';
import { WithdrawModule } from 'src/_modules/withdraw/withdraw.module';
import { ZoneModule } from 'src/_modules/zone/zone.module';
import { GlobalModule } from 'src/globals/global.module';
import { MaintenanceInterceptor } from 'src/globals/interceptors/maintance.interceptor';
import { LocaleMiddleware } from 'src/globals/middlewares/locale.middleware';
import { NotificationMiddleware } from 'src/globals/middlewares/notification.middleware';
import { RateLimitMiddleware } from 'src/globals/middlewares/rate-limit.middleware';
import { XssMiddleware } from 'src/globals/middlewares/xss.middleware';
import { NotificationService } from 'src/globals/services/notification.service';
import { NotificationQueueModule } from 'src/notification-queue/notification-queue.module';
import { NotificationModule } from './_modules/notification/notification.module';
import { SearchModule } from './_modules/search/search.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SwaggerDiffController } from './swagger/swagger-diff.controller';

import { AdminNotificationModule } from 'src/_modules/admin-notification/admin-notification.module';
import { BundleModule } from 'src/_modules/bundle/bundle.module';
import { CampaignModule } from 'src/_modules/campaign/campaign.module';
import { EmployeeModule } from 'src/_modules/employee/employee.module';
import { FortuneWheelModule } from 'src/_modules/fortune-wheel/fortune-wheel.module';
import { HomeModule } from 'src/_modules/home/home.module';
import { LogsModule } from 'src/_modules/logs/logs.module';
import { StoreTemplateModule } from 'src/_modules/store-template/store-template.module';
import { VariationTemplateModule } from 'src/_modules/variation-template/variation-template.module';

const I18N_DIR = path.join(process.cwd(), './i18n');

@Module({
  imports: [
    ScheduleModule.forRoot(),
    I18nModule.forRootAsync({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
      ],
      useFactory: (configService: ConfigService) => ({
        fallbackLanguage: configService.getOrThrow('FALLBACK_LANGUAGE'),
        loaderOptions: {
          path: I18N_DIR,
          watch: true,
        },
      }),
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang', 'local-lang']),
      ],
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'notification',
    }),
    GlobalModule,
    SearchModule,
    NotificationModule,
    MediaModule,
    AuthenticationModule,
    AuthorizationModule,
    UserModule,
    LanguagesModule,
    NotificationQueueModule,
    CouponModule,
    BannerModule,
    CategoryModule,
    StoreModule,
    BranchModule,
    ServiceModule,
    FilterModule,
    RatingModule,
    SettingsModule,
    SocialMediaModule,
    SystemNotificationModule,
    TransactionModule,
    OrderModule,
    CityModule,
    StatisticsModule,
    WithdrawModule,
    KeyValueModule,
    ComplaintModule,
    ZoneModule,
    DeliveryModule,
    KashierModule,
    AdminNotificationModule,
    VariationTemplateModule,
    FortuneWheelModule,
    LogsModule,
    CampaignModule,
    HomeModule,
    StoreTemplateModule,
    BundleModule,
    EmployeeModule,
  ],
  controllers: [AppController, SwaggerDiffController],
  providers: [
    AppService,
    NotificationService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MaintenanceInterceptor,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LocaleMiddleware).forRoutes('*');
    consumer.apply(XssMiddleware).forRoutes('*');
    consumer.apply(RateLimitMiddleware).forRoutes('*');
    consumer.apply(NotificationMiddleware).forRoutes('*');
  }
}
