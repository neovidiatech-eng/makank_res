import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { LessThanField } from 'src/decorators/dto/validators/less-than-field.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateNullableNumber } from 'src/decorators/dto/validators/validate-nullable-number.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';

export class AddonDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Required()
  @ValidateNumber()
  price: number;

  @Optional()
  @ValidateNullableNumber()
  @LessThanField('price')
  priceAfterDiscount?: number | null;
}
