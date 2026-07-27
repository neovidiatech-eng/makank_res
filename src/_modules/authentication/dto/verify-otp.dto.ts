import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateEmailOrPhone } from 'src/decorators/dto/validators/validate-email-or-phone.decorator';
import { ValidateOTP } from 'src/decorators/dto/validators/validate-otp.decorator';

export class VerifyOtpDTO {
  @Required()
  @ValidateOTP()
  otp: string;
}

export class VerifyAccountDTO {
  @ValidateEmailOrPhone()
  emailOrPhone: string;

  @ValidateOTP()
  otp: string;
}
