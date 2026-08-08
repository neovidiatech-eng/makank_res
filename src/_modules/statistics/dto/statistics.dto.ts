import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { ValidateDate } from 'src/decorators/dto/validators/validate-date.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export enum StatisticsPeriodEnum {
  TODAY = 'TODAY',
  YESTERDAY = 'YESTERDAY',
  THIS_WEEK = 'THIS_WEEK',
  THIS_MONTH = 'THIS_MONTH',
  THIS_YEAR = 'THIS_YEAR',
  CUSTOM = 'CUSTOM',
}

export class FilterStatisticsDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateDate()
  fromDate?: Date;

  @Optional()
  @ValidateDate()
  toDate?: Date;

  @Optional()
  @ValidateDate()
  date?: Date;

  @Optional({ enum: StatisticsPeriodEnum })
  @ValidateEnum(StatisticsPeriodEnum)
  periodFilter?: StatisticsPeriodEnum;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  storeId?: number;
}
