import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateSpecialistDTO {
  @Required()
  @ValidateString()
  name: string;

  @Optional()
  @ValidateNumber()
  @ValidateExist<'store'>()
  storeId?: Id;
}

export class UpdateSpecialistDTO {
  @Optional()
  @ValidateString()
  name?: string;
}

export class FilterSpecialistDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateNumber()
  storeId?: Id;

  @Optional()
  name?: string;
}
