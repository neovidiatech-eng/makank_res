import { Required } from 'src/decorators/dto/required-input.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';

export class CreateLogDTO {
  @OptionalSwagger()
  userId: string;

  @Required()
  @ValidateString()
  userName: string;

  @Required()
  @ValidateString()
  userRole: string;

  @Required()
  @ValidateString()
  action: string;

  @Required()
  @ValidateString()
  details: string;

  @OptionalSwagger()
  storeId?: number;
}
