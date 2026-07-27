import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateObject } from 'src/decorators/dto/validators/validate-nested.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class FilterSlotsDTO {
  @Optional()
  @ValidateNumber()
  slots?: number;
}
export class PriceRangeDTO {
  @Required()
  @ValidateNumber()
  min?: number;

  @Required()
  @ValidateNumber()
  max?: number;
}

export class SortFilterDataDTO {
  @SortProp()
  price?: SortOptions;
  @SortProp()
  rating?: SortOptions;
}

export class FilterStoreData {
  @Optional()
  @ValidateBoolean()
  isVerified?: boolean;

  @Optional()
  @ValidateBoolean()
  closed?: boolean;
}
export class FilterDataDTO extends PaginationParamsDTO {
  @Optional({ type: PriceRangeDTO })
  @ValidateObject(PriceRangeDTO)
  price?: PriceRangeDTO;

  @Optional({ type: FilterStoreData })
  @ValidateObject(FilterStoreData)
  store?: FilterStoreData;

  @Optional()
  @ValidateNumber()
  rating?: number;

  @Optional()
  @ValidateNumber()
  km?: number;

  @Optional()
  @ValidateNumber({ allowNegative: true })
  lat: number;

  @Optional()
  @ValidateNumber({ allowNegative: true })
  lng: number;

  @OptionalSwagger()
  customerId: number;

  @OptionalSwagger()
  favouriteCustomerId: number;

  @Optional()
  orderBy?: SortFilterDataDTO[];
}
