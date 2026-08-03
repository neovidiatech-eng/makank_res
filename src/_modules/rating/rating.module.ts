import { Module } from '@nestjs/common';
import { RatingController } from './controllers/rating.controller';
import { ServiceRatingModule } from './serviceRating/serviceRating.module';
import { RatingService } from './services/rating.service';
import { StoreRatingModule } from './storeRating/storeRating.module';
import { NotificationService } from 'src/globals/services/notification.service';

@Module({
  imports: [ServiceRatingModule, StoreRatingModule],
  providers: [RatingService, NotificationService],
  controllers: [RatingController],
})
export class RatingModule {}
