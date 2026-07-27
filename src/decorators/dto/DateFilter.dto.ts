import { Required } from './required-input.decorator';
import { ValidateDate } from './validators/validate-date.decorator';

export class FilterWithDateDTO {
  @Required()
  @ValidateDate()
  from: Date;

  @Required()
  @ValidateDate()
  to: Date;
}
