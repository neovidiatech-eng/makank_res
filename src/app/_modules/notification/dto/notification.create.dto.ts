import { OptionalFile } from 'src/_modules/media/decorators/upload.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';

export class CreateNotificationDTO {
  @Required()
  @ValidateName()
  title: Json;
  @Required()
  @ValidateName()
  body: Json;
  @OptionalFile()
  image: string;
}
