import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateAddressDTO {
  @Required()
  @ValidateString()
  title: string;

  @Required()
  @ValidateString()
  address: string;

  @Required()
  @ValidateNumber({ allowNegative: true })
  lat: number;

  @Required()
  @ValidateNumber({ allowNegative: true })
  lng: number;

  @OptionalSwagger()
  userId: Id;
}
export class UpdateAddressDTO extends PartialType(CreateAddressDTO) {
  @Optional()
  @ValidateBoolean()
  default: boolean;
}

export class SortAddressDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;

  @SortProp()
  title?: SortOptions;

  @SortProp()
  lat?: SortOptions;

  @SortProp()
  lng?: SortOptions;

  @SortProp()
  default?: SortOptions;
}
export class FilterAddressDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  title?: string;

  @Optional()
  @ValidateNumber({ allowNegative: true })
  lat?: number;

  @Optional()
  @ValidateNumber({ allowNegative: true })
  lng?: number;

  @Optional()
  @ValidateBoolean()
  default?: boolean;

  @Optional()
  orderBy?: SortAddressDTO[];

  @OptionalSwagger()
  userId: Id;
}
