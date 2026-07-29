import { Required } from 'src/decorators/dto/required-input.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { FilterPaginationWithId } from 'src/dtos/params/pagination-params.dto';

export class FilterRatingDTO extends FilterPaginationWithId {
  @Optional()
  @ValidateNumber()
  orderId?: Id;

  @Optional()
  @ValidateNumber()
  branchId?: Id;

  @Optional()
  @ValidateNumber()
  storeId?: Id;

  @Optional()
  @ValidateNumber()
  deliveryId?: Id;
}

export class ReplyRatingDTO {
  @Required()
  @ValidateString()
  reply: string;
}
