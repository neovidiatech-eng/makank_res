import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateFundDTO {
  @Required()
  @ValidateNumber()
  @ValidateExist<'user'>({ model: 'user' })
  customerId: number;

  @Required()
  @ValidateNumber()
  price: number;
}

export class FilterFundDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id: Id;

  @Optional()
  @ValidateNumber()
  customerId: number;
}
