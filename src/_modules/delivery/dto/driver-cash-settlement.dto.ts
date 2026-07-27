import { Min } from 'class-validator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateCashSettlementDTO {
  // DeliveryDetails is keyed by userId (not id), so the generic ValidateExist<> helper
  // (which always checks an `id` column) doesn't fit — the service layer checks
  // existence explicitly instead.
  @Required()
  @ValidateNumber()
  deliveryId: number;

  @Required()
  @ValidateNumber()
  @Min(1)
  amount: number;

  @Optional()
  @ValidateString()
  note?: string;
}

export class FilterCashSettlementDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateNumber()
  deliveryId?: Id;
}
