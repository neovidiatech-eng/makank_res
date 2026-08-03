import { Module } from '@nestjs/common';
import { LanguagesService } from '../languages/languages.service';
import { SpecialDeliveryBannerController } from './special-delivery-banner.controller';
import { SpecialDeliveryBannerService } from './special-delivery-banner.service';
import { SpecialDeliveryBannerHelperService } from './helpers/special-delivery-banner.helper.service';

@Module({
  imports: [],
  controllers: [SpecialDeliveryBannerController],
  providers: [
    SpecialDeliveryBannerService,
    SpecialDeliveryBannerHelperService,
    LanguagesService,
  ],
})
export class SpecialDeliveryBannerModule {}
