import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Max, Min } from 'class-validator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import {
  ValidateNumber,
  ValidateNumberArray,
} from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidatePhone } from 'src/decorators/dto/validators/validate-phone.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateBranchDTO {
  @Optional()
  @ValidateNumber()
  @ValidateExist<'store'>({ model: 'store' })
  storeId: Id;

  @Required()
  @ValidateName()
  name: Json;

  @Optional()
  @ValidatePhone()
  @ApiProperty({ example: '01234567890' })
  phone?: string;

  @Required()
  @ValidateString()
  @ApiProperty({ example: 'Branch Address' })
  address: string;

  @Required()
  @Min(-90)
  @Max(90)
  @ValidateNumber({ allowNegative: true })
  @ApiProperty({ example: 30.0 })
  lat: number;

  @Required()
  @Min(-180)
  @Max(180)
  @ValidateNumber({ allowNegative: true })
  @ApiProperty({ example: 31.0 })
  lng: number;

  @Required()
  @ValidateBoolean()
  isActive: boolean;

  // Zones this branch covers. Used to derive the allowed zones for banners
  // targeting the store (Store -> Branch -> BranchZone -> Zone).
  @Optional()
  @ValidateNumberArray({ allowNegative: false })
  @ValidateExist<'zone'>({ model: 'zone', isArray: true })
  @ApiProperty({ required: false, type: [Number], example: [1, 2] })
  zoneIds?: Id[];
}

export class UpdateBranchDTO extends PartialType(CreateBranchDTO) {
  @Optional()
  @ValidateBoolean()
  @ApiProperty({ example: true })
  isActive?: boolean;

  @Optional()
  @ValidateBoolean()
  @ApiProperty({ example: false })
  closed?: boolean;

  @Optional()
  @ValidateBoolean()
  @ApiProperty({ example: false })
  temporarilyClosed?: boolean;

  // Auto-stop cap — once this many orders are simultaneously active for the
  // branch, new orders are rejected at checkout. Null/omitted means no cap.
  @Optional()
  @ValidateNumber()
  @ApiProperty({ example: 20 })
  maxActiveOrders?: number;
}

export class SortBranchDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;

  @SortProp()
  @ApiProperty({ example: 'asc' })
  rating?: SortOptions;
}

export class FilterBranchDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  @ApiProperty({ example: 1 })
  id?: Id;

  @Optional()
  @ValidateNumber()
  @ApiProperty({ example: 1 })
  storeId?: Id;

  @Optional()
  @ValidateString()
  @ApiProperty({ example: 'Branch Name' })
  name?: string;

  @Optional()
  @ValidateBoolean()
  @ApiProperty({ example: true })
  isActive?: boolean;

  @Optional()
  @ValidateBoolean()
  @ApiProperty({ example: false })
  closed?: boolean;

  @Optional()
  @ValidateBoolean()
  @ApiProperty({ example: false })
  temporarilyClosed?: boolean;

  @Optional()
  orderBy?: SortBranchDTO[];
}
