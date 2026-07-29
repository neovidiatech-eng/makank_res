import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateVariationTemplateDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Required()
  values: any[];

  // Auto-filled from the session for a Store-role caller (see AttachStoreId);
  // omit entirely (or an Admin may leave it out) for a global preset visible
  // to every store.
  @Optional()
  @ValidateNumber()
  @ValidateExist<'store'>({ model: 'store' })
  storeId?: Id;
}

export class FilterVariationTemplateDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  storeId?: Id;
}
