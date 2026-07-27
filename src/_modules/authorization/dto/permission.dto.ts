import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';

export class UpdatePermissionDTO {
  @Required()
  @ValidateName()
  name: Json;
}
