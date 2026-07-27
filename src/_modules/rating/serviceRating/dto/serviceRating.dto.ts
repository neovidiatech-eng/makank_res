import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateServiceRatingDTO {
  @Required()
  @ValidateNumber()
  rating: number;
  @Required()
  @ValidateNumber({ allowNegative: false })
  serviceId: Id;
  @Optional()
  @ValidateNumber({ allowNegative: false })
  userId: Id;
  @Optional()
  @ValidateNumber({ allowNegative: false })
  orderId: Id;
}
export class UpdateServiceRatingDTO {
  @Required()
  @ValidateNumber()
  rating: number;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  userId: Id;
}

export class FilterServiceRatingDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateNumber()
  serviceId?: string;
  @Optional()
  @ValidateNumber()
  userId?: string;
}
