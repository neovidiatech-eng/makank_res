import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ServiceStatus } from '@prisma/client';
import { PriceRangeDTO } from 'src/_modules/filter/dto/filter.dto';
import { RequiredFile } from 'src/_modules/media/decorators/upload.decorator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { LessThanField } from 'src/decorators/dto/validators/less-than-field.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateObject } from 'src/decorators/dto/validators/validate-nested.decorator';
import { ValidateNullableNumber } from 'src/decorators/dto/validators/validate-nullable-number.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';
import { AddonDTO } from './addon.dto';
import { SizeDTO } from './size.dto';

export class CreateServiceDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Required()
  @ValidateName()
  description: Json;

  @RequiredFile()
  image: string;

  @Required()
  @ValidateNumber()
  durationMinutes: number;

  @Required()
  @ValidateNumber()
  price: number;

  // Optional absolute discounted headline price; must be < price. Present-but-empty
  // clears the column (null), an absent key is a Prisma no-op (see @ValidateNullableNumber).
  @Optional()
  @ValidateNullableNumber()
  @LessThanField('price')
  priceAfterDiscount?: number | null;

  // Optional on create: the DB defaults to PENDING so new services await admin
  // moderation. Stripped for users without permission (see controller) — a store
  // owner cannot self-publish straight to ACTIVE.
  @Optional()
  @ValidateEnum(ServiceStatus)
  status?: ServiceStatus;

  @Optional()
  @ValidateBoolean()
  available?: boolean;

  @Optional()
  @ValidateNumber()
  @ValidateExist<'store'>({ model: 'store' })
  storeId: Id;

  @Required()
  @ValidateNumber()
  @ValidateExist<'category'>({
    model: 'category',
  })
  categoryId: Id;

  @Optional({ type: SizeDTO, isArray: true })
  @ValidateObject(SizeDTO, true)
  Sizes?: SizeDTO[];

  @Optional({ type: AddonDTO, isArray: true })
  @ValidateObject(AddonDTO, true)
  Addons: AddonDTO[];
}
// All fields optional (PartialType) so partial updates — e.g. toggling
// `available` or renaming — don't require resending `price`/`status`.
export class UpdateServiceDTO extends PartialType(CreateServiceDTO) {}

export class SortServiceDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;

  @SortProp()
  @ApiProperty({ example: 'asc' })
  rating?: SortOptions;

  @SortProp()
  @ApiProperty({ example: 'asc' })
  price?: SortOptions;
}
export class FilterServiceDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional({
    description: 'Case-insensitive substring search across ar and en name',
  })
  @ValidateString()
  name?: string;

  @Optional({
    description:
      'Case-insensitive substring search across ar and en description',
  })
  @ValidateString()
  description?: string;

  @Optional()
  @ValidateNumber()
  storeId?: Id;

  @Optional()
  @ValidateNumber()
  categoryId?: Id;

  @Optional()
  @ValidateBoolean()
  bestRated?: boolean;

  @Optional()
  @ValidateBoolean()
  mostSeller?: boolean;

  @Optional()
  @ValidateEnum(ServiceStatus)
  status?: string;

  @Optional()
  @ValidateBoolean()
  available?: boolean;

  @Optional()
  @ValidateNumber()
  customerId?: Id;

  @OptionalSwagger()
  favouriteCustomerId: Id;

  @Optional({ type: PriceRangeDTO })
  price?: PriceRangeDTO;

  @Optional()
  @ValidateNumber()
  rating?: number;

  @Optional()
  orderBy?: SortServiceDTO[];
}
