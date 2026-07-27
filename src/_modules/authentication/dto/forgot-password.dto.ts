import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateEmail } from 'src/decorators/dto/validators/validate-email.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';

export class ForgetPasswordDTO {
  @Required({})
  @ValidateEmail()
  email: string;

  @ValidateExist<'role'>({ model: 'role' })
  roleKey?: string;
}
