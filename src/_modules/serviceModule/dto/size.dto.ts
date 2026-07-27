import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { LessThanField } from 'src/decorators/dto/validators/less-than-field.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';

export class SizeDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Required()
  @ValidateNumber()
  price: number;

  // Optional absolute discounted price for this size; must be < price. Sizes are
  // deleted + recreated on every update, so an omitted value naturally clears it.
  @Optional()
  @ValidateNumber()
  @LessThanField('price')
  priceAfterDiscount?: number;

  @Optional()
  @ValidateBoolean()
  isDefault: boolean;
}
