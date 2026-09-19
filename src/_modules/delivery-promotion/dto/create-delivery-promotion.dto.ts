import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { DeliveryPromoScope, PromoDiscountType } from '@prisma/client';

export class CreateDeliveryPromotionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  badgeText?: string;

  @IsEnum(DeliveryPromoScope)
  scope: DeliveryPromoScope;

  @IsEnum(PromoDiscountType)
  discountType: PromoDiscountType;

  @IsNumber()
  @Min(0)
  promoValue: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  storeId?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  zoneId?: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
