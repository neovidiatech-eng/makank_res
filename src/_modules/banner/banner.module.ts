import { Module } from '@nestjs/common';
import { LanguagesService } from '../languages/languages.service';
import { BannerController } from './banner.controller';
import { BannerService } from './banner.service';
import { BannerHelperService } from './helpers/banner.helper.service';

@Module({
  imports: [],
  controllers: [BannerController],
  providers: [BannerService, BannerHelperService, LanguagesService],
})
export class BannerModule {}
