import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';

export class PaymentDetailDTO {
  @Required()
  @ValidateString()
  paymentId: string;
}
