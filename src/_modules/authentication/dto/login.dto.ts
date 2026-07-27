import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateEmail } from 'src/decorators/dto/validators/validate-email.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateOTP } from 'src/decorators/dto/validators/validate-otp.decorator';
import { ValidateLoginPassword } from 'src/decorators/dto/validators/validate-password.decorator';
import { ValidatePhone } from 'src/decorators/dto/validators/validate-phone.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { EnumArrayFilter } from 'src/decorators/filters/enum.filter.decorator';

class LoginInfoDTO {
  @Required()
  @ValidateString()
  locale: string;

  @Optional({ example: 'user' })
  fcm?: string;
}

export class PhoneOTPLoginRequestDTO {
  @ValidatePhone()
  phone: string;
}
export class PhoneOTPLoginDTO extends LoginInfoDTO {
  @ValidatePhone()
  phone: string;

  @ValidateOTP()
  otp: string;
}

export class EmailPasswordLoginDTO extends LoginInfoDTO {
  @Required({ example: 'test@test.com' })
  @ValidateEmail()
  email: string;

  @Optional({})
  @ValidatePhone()
  phone?: string;

  @Required()
  @ValidateLoginPassword()
  password: string;

  @ValidateExist<'role'>({ model: 'role' })
  roleKey?: string;
}

export class BioLoginDTO extends LoginInfoDTO {
  @Required({})
  @ValidateString()
  deviceId?: string;

  @Required({})
  @ValidateExist<'role'>({ model: 'role' })
  roleKey: string;
}

enum RolesCanLoginWithPhone {
  CUSTOMER = 'CUSTOMER',
}
export class RequestOtpDto {
  @ValidatePhone()
  phone: string;

  @EnumArrayFilter(RolesCanLoginWithPhone, 'role', 'Role')
  role?: RolesCanLoginWithPhone;
}
