import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateVariationTemplateDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Required()
  values: any[];
}

export class FilterVariationTemplateDTO extends PaginationParamsDTO {}
