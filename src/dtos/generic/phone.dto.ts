import { ValidatePhone } from 'src/decorators/dto/validators/validate-phone.decorator';

export class PhoneDTO {
  @ValidatePhone()
  phone: string;
}
