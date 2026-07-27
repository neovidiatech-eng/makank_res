import { Module } from '@nestjs/common';
import { ServiceRatingController } from './serviceRating.controller';
import { ServiceRatingService } from './serviceRating.service';
import { HelpersService } from './services/helpers.service';

@Module({
  controllers: [ServiceRatingController],
  providers: [ServiceRatingService, HelpersService],
})
export class ServiceRatingModule {}
