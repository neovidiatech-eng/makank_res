import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CouponType, DiscountType } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { ValidateDate } from 'src/decorators/dto/validators/validate-date.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import {
  ValidateNumber,
  ValidateNumberArray,
} from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { ValidateUnique } from 'src/decorators/dto/validators/validate-unique-number.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateCouponDTO {
  @Required()
  @ValidateName()
  title: Json;

  @Required()
  @ValidateString()
  @ValidateUnique<'coupon'>({ model: 'coupon' })
  code: string;

  @Required()
  @ValidateEnum(CouponType)
  type: CouponType;

  @Required()
  @ValidateEnum(DiscountType)
  discountType: DiscountType;

  @Required()
  @ValidateNumber()
  discountValue: number;

  @Required()
  @ValidateNumber()
  maxUsage: number;

  @Required()
  @ValidateNumber()
  usageCount: number;

  @Required()
  @ValidateNumber()
  minOrderAmount: number;

  @Required()
  @ValidateDate()
  startDate: Date;

  @Required()
  @ValidateDate()
  endDate: Date;

  @Required()
  @ValidateNumber()
  minDiscountValue: number;

  @Required()
  @ValidateNumber()
  maxDiscountValue: number;

  @Optional()
  @ValidateNumberArray()
  @ValidateExist<'user'>({
    model: 'user',
    extraConditions: { roleKey: RolesKeys.CUSTOMER },
    isArray: true,
  })
  userIds?: Id[];

  @Optional()
  @ValidateNumberArray()
  @ValidateExist<'store'>({ model: 'store', isArray: true })
  storeIds?: Id[];
  // Optional zone restriction. Omit/empty → coupon is global (valid in every zone);
  // a non-empty array restricts the coupon to those delivery zones.
  @Optional()
  @ValidateNumberArray()
  @ValidateExist<'zone'>({ model: 'zone', isArray: true })
  zoneIds?: Id[];

  @Optional()
  @ValidateName()
  notificationTitle?: Json;

  @Optional()
  @ValidateName()
  notificationDescription?: Json;
}
export class UpdateCouponDTO extends PartialType(CreateCouponDTO) {}

export class SortCouponDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;

  @SortProp()
  code?: SortOptions;

  @SortProp()
  title?: SortOptions;

  @SortProp()
  type?: SortOptions;

  @SortProp()
  discountType?: SortOptions;

  @SortProp()
  discountValue?: SortOptions;

  @SortProp()
  maxUsage?: SortOptions;

  @SortProp()
  usageCount?: SortOptions;

  @SortProp()
  minOrderAmount?: SortOptions;

  @SortProp()
  startDate?: SortOptions;

  @SortProp()
  endDate?: SortOptions;

  @SortProp()
  minDiscountValue?: SortOptions;

  @SortProp()
  maxDiscountValue?: SortOptions;

  @SortProp()
  userId?: SortOptions;

  @SortProp()
  storeId?: SortOptions;
}
export class FilterCouponDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  code?: string;

  @Optional()
  @ValidateString()
  title?: string;

  @Optional()
  @ValidateEnum(CouponType)
  type?: CouponType;

  @Optional()
  @ValidateEnum(DiscountType)
  discountType?: DiscountType;

  @Optional()
  @ValidateNumber()
  discountValue?: number;

  @Optional()
  @ValidateNumber()
  maxUsage?: number;

  @Optional()
  @ValidateNumber()
  usageCount?: number;

  @Optional()
  @ValidateNumber()
  minOrderAmount?: number;

  @Optional()
  @ValidateDate()
  startDate?: Date;

  @Optional()
  @ValidateDate()
  endDate?: Date;

  @Optional()
  @ValidateNumber()
  minDiscountValue?: number;

  @Optional()
  @ValidateNumber()
  maxDiscountValue?: number;

  @Optional()
  @ValidateNumber()
  @ValidateExist<'user'>({
    model: 'user',
    extraConditions: { roleKey: RolesKeys.CUSTOMER },
  })
  userId?: Id;

  @Optional()
  @ValidateNumber()
  @ValidateExist<'store'>({ model: 'store' })
  storeId?: Id;

  @Optional()
  orderBy?: SortCouponDTO[];
}
