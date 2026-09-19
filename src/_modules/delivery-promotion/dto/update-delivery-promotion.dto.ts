import { PartialType } from '@nestjs/mapped-types';
import { CreateDeliveryPromotionDto } from './create-delivery-promotion.dto';

export class UpdateDeliveryPromotionDto extends PartialType(CreateDeliveryPromotionDto) {}
