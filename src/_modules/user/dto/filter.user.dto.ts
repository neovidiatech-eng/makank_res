import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class FilterUserDTO extends PaginationParamsDTO {
  @Optional({})
  @ValidateNumber({ allowNegative: false })
  id?: Id;

  @Optional({})
  @ValidateString()
  name?: string;

  @Optional()
  @ValidateString()
  email?: string;

  @Optional()
  @ValidateString()
  phone?: string;

  @Optional()
  roleId?: Id;

  @OptionalSwagger()
  roleKey?: string;

  @OptionalSwagger()
  storeId?: Id;
}
