import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateCategoryDTO {
  @Required()
  @ValidateName()
  name: Json;

  // Scopes a custom category to one store. Auto-filled from the session for a
  // STORE-role caller (see AttachStoreId); admins/management users may set it
  // explicitly since storeIdOptionalForManagementUser is true on this route.
  @Optional()
  @ValidateNumber({})
  @ValidateExist<'store'>({ model: 'store' })
  storeId?: Id;

  @Optional()
  @ValidateString()
  image?: string;

  @Optional()
  @ValidateNumber()
  order?: number;
}
export class UpdateCategoryDTO extends PartialType(CreateCategoryDTO) {
  @Optional()
  @ValidateBoolean()
  active?: boolean;
}

export class SortCategoryDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;
}
export class FilterCategoryDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  name?: string;

  @Optional()
  @ValidateNumber()
  storeId?: Id;

  /**
   * true  → فئات المتاجر فقط (storeId IS NOT NULL)
   * false → فئات القوالب فقط  (storeId IS NULL)
   * omit  → الكل
   */
  @Optional()
  @ValidateBoolean()
  isCustomStoreCategory?: boolean;

  @Optional()
  orderBy?: SortCategoryDTO[];
}
