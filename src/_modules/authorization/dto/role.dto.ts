import { PartialType } from '@nestjs/swagger';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateNumberArray } from 'src/decorators/dto/validators/validate-number.decorator';

export class CreateRoleDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Optional({ type: 'number', isArray: true })
  @ValidateNumberArray()
  @ValidateExist<'permission'>({ model: 'permission', isArray: true })
  permissionIds: number[];
}
export class UpdateRoleDTO extends PartialType(CreateRoleDTO) {}
