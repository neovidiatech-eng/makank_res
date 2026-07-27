import { PartialType } from '@nestjs/swagger';
import { FortuneWheelRewardType } from '@prisma/client';
import { Min } from 'class-validator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateFortuneWheelItemDTO {
  @Required()
  @ValidateString()
  displayName: string;

  @Required()
  @ValidateEnum(FortuneWheelRewardType)
  rewardType: FortuneWheelRewardType;

  @Optional()
  @ValidateNumber()
  rewardValue?: number;

  @Optional()
  @ValidateNumber()
  @Min(0, { message: 'weight must be >= 0' })
  weight?: number;

  @Optional()
  @ValidateNumber()
  maxDiscount?: number;

  @Optional()
  @ValidateNumber()
  minOrderAmount?: number;

  @Optional()
  @ValidateNumber()
  maxOrderAmount?: number;

  @Optional()
  @ValidateNumber()
  rewardExpiryHours?: number;

  @Optional()
  @ValidateBoolean()
  isActive?: boolean;

  @Optional()
  @ValidateNumber()
  sortOrder?: number;
}

export class UpdateFortuneWheelItemDTO extends PartialType(
  CreateFortuneWheelItemDTO,
) {}

export class UpdateFortuneWheelSettingsDTO {
  @Required()
  @ValidateNumber()
  @Min(1, { message: 'displayIntervalHours must be greater than 0' })
  displayIntervalHours: number;

  @Optional()
  @ValidateBoolean()
  isEnabled?: boolean;
}

export class SortFortuneWheelItemDTO {
  @SortProp()
  id?: SortOptions;

  @SortProp()
  sortOrder?: SortOptions;

  @SortProp()
  displayName?: SortOptions;

  @SortProp()
  createdAt?: SortOptions;
}

export class FilterFortuneWheelItemDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  displayName?: string;

  @Optional()
  @ValidateEnum(FortuneWheelRewardType)
  rewardType?: FortuneWheelRewardType;

  @Optional()
  @ValidateBoolean()
  isActive?: boolean;

  @Optional()
  orderBy?: SortFortuneWheelItemDTO[];
}

export class FilterUserRewardDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateEnum({ valid: 'valid', used: 'used', expired: 'expired' }, true)
  status?: 'valid' | 'used' | 'expired';

  @Optional()
  @ValidateEnum(FortuneWheelRewardType)
  rewardType?: FortuneWheelRewardType;
}
