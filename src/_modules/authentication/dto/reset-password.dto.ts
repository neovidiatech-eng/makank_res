import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidatePassword } from 'src/decorators/dto/validators/validate-password.decorator';

export class ResetPasswordDTO {
  @Required()
  @ValidatePassword()
  password: string;
}

export class VerifyResetOtpDTO {
  @Required()
  otp: string;
}
