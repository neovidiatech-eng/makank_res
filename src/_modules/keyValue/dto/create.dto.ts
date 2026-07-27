import { PartialType } from '@nestjs/swagger';
import { OptionalFile } from 'src/_modules/media/decorators/upload.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { ValidateUnique } from 'src/decorators/dto/validators/validate-unique-number.decorator';

export class CreateKeyValueDTO {
  @Optional()
  @ValidateName()
  value: string;

  @Required()
  @ValidateString()
  @ValidateUnique<'keyValue'>({ model: 'keyValue' })
  key: string;

  @OptionalFile()
  file?: string;
}
export class UpdateKeyValueDTO extends PartialType(CreateKeyValueDTO) {}
