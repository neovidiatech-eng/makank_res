import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { ValidateDate } from 'src/decorators/dto/validators/validate-date.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class FilterStatisticsDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateDate()
  fromDate?: Date;
  @Optional()
  @ValidateDate()
  toDate?: Date;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  storeId?: number;
}
