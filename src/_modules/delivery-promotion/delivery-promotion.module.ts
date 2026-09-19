import { Module } from '@nestjs/common';
import { DeliveryPromotionController } from './delivery-promotion.controller';
import { DeliveryPromotionService } from './delivery-promotion.service';

@Module({
  controllers: [DeliveryPromotionController],
  providers: [DeliveryPromotionService],
  exports: [DeliveryPromotionService],
})
export class DeliveryPromotionModule {}
