import { Module } from '@nestjs/common';
import { HelpersService } from './services/helpers.service';
import { StoreRatingController } from './storeRating.controller';
import { StoreRatingService } from './storeRating.service';

@Module({
  controllers: [StoreRatingController],
  providers: [StoreRatingService, HelpersService],
})
export class StoreRatingModule {}
