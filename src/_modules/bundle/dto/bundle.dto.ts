import { PartialType } from '@nestjs/swagger';
import {
  BundleFreeValueRule,
  BundlePricingMode,
  BundleSizeRule,
  BundleType,
} from '@prisma/client';
import { RequiredFile } from 'src/_modules/media/decorators/upload.decorator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { LessThanField } from 'src/decorators/dto/validators/less-than-field.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateDate } from 'src/decorators/dto/validators/validate-date.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateNullableNumber } from 'src/decorators/dto/validators/validate-nullable-number.decorator';
import {
  ValidateNumber,
  ValidateNumberArray,
} from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateBundleDTO {
  @Required()
  @ValidateName()
  title: Json;

  @Required()
  @ValidateName()
  description: Json;

  @RequiredFile()
  image: string;

  @Required()
  @ValidateNumber({ allowNegative: false })
  @ValidateExist<'store'>({ model: 'store' })
  storeId: Id;

  @Required()
  @ValidateNumber({ allowNegative: false })
  requiredPaidQuantity: number;

  @Required()
  @ValidateNumber({ allowNegative: false })
  freeQuantity: number;

  @Optional()
  @ValidateBoolean()
  isActive?: boolean;

  @Optional()
  @ValidateEnum(BundleType)
  type?: BundleType;

  @Optional({
    description:
      'Default: DYNAMIC. DYNAMIC uses menu prices; FIXED uses priceAfterDiscount as the bundle price.',
  })
  @ValidateEnum(BundlePricingMode)
  pricingMode?: BundlePricingMode;

  @Optional({
    description: 'Optional reference price before discount for fixed-price bundles.',
  })
  @ValidateNullableNumber()
  priceBeforeDiscount?: number | null;

  @Optional({
    description:
      'Required when pricingMode = FIXED. Absolute fixed offer price for the bundle.',
  })
  @ValidateNullableNumber()
  @LessThanField('priceBeforeDiscount')
  priceAfterDiscount?: number | null;

  @Optional({
    description:
      'Default: ANY. Set to NAME to require a specific size name for paid items.',
  })
  @ValidateEnum(BundleSizeRule)
  paidSizeRule?: BundleSizeRule;

  @Optional({
    description:
      'Required when paidSizeRule = NAME. Case-insensitive, matches any locale.',
  })
  @ValidateString()
  paidRequiredSizeName?: string;

  @Optional({
    description:
      'Default: ANY. Set to NAME to require a specific size name for free items.',
  })
  @ValidateEnum(BundleSizeRule)
  freeSizeRule?: BundleSizeRule;

  @Optional({
    description:
      'Required when freeSizeRule = NAME. Case-insensitive, matches any locale.',
  })
  @ValidateString()
  freeRequiredSizeName?: string;

  @Optional({
    description:
      'Default: CAP_TO_CHEAPEST_PAID. Controls the max value allowed for free items.',
  })
  @ValidateEnum(BundleFreeValueRule)
  freeValueRule?: BundleFreeValueRule;

  @Optional({
    description:
      'Required when freeValueRule = MAX_FREE_VALUE. Max base price for a free item.',
  })
  @ValidateNumber({ allowNegative: false })
  maxFreeItemValue?: number;

  @Optional()
  @ValidateDate()
  startDate?: Date;

  @Optional()
  @ValidateDate()
  endDate?: Date;

  @Required({
    description: 'Which products count as "paid" pieces in this offer.',
  })
  @ValidateNumberArray({ allowNegative: false })
  @ValidateExist<'service'>({ model: 'service', isArray: true })
  paidServiceIds: Id[];

  @Required({
    description: 'Which products count as the "free" piece in this offer.',
  })
  @ValidateNumberArray({ allowNegative: false })
  @ValidateExist<'service'>({ model: 'service', isArray: true })
  freeServiceIds: Id[];
}

export class UpdateBundleDTO extends PartialType(CreateBundleDTO) {}

export class SortBundleDTO {
  @SortProp()
  id?: SortOptions;

  @SortProp()
  createdAt?: SortOptions;
}

export class FilterBundleDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateNumber()
  storeId?: Id;

  @Optional()
  @ValidateBoolean()
  isActive?: boolean;

  @Optional()
  orderBy?: SortBundleDTO[];
}
