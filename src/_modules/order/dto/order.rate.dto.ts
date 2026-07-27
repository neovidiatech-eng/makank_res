import { Max, Min } from 'class-validator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';

export class RateDTO {
  @Optional()
  @ValidateNumber()
  @Min(1)
  @Max(5)
  storeRate?: number;

  @Optional()
  @ValidateNumber()
  @Min(1)
  @Max(5)
  deliveryRate?: number;

  @Optional()
  @ValidateString()
  storeComment?: string;

  @Optional()
  @ValidateString()
  deliveryComment?: string;
}
