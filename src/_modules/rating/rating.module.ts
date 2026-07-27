import { Module } from '@nestjs/common';
import { RatingController } from './controllers/rating.controller';
import { ServiceRatingModule } from './serviceRating/serviceRating.module';
import { RatingService } from './services/rating.service';
import { StoreRatingModule } from './storeRating/storeRating.module';

@Module({
  imports: [ServiceRatingModule, StoreRatingModule],
  providers: [RatingService],
  controllers: [RatingController],
})
export class RatingModule {}
