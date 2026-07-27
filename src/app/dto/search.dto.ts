import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';

export class SearchDTO {
  @Required()
  @ValidateString()
  search: string;
}

export class vvDTO {
  @Required()
  @ValidateName()
  name: JSON;
}
