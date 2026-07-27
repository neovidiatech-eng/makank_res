import { PartialType } from '@nestjs/swagger';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class FilterCustomerDTO extends PartialType(PaginationParamsDTO) {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  name?: string;

  @Optional()
  @ValidateString()
  email?: string;

  @Optional()
  @ValidateString()
  phone?: string;

  @Optional()
  @ValidateBoolean()
  verified: boolean;

  @Optional()
  @ValidateBoolean()
  active: boolean;
}
