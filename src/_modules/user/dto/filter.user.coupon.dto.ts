import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class FilterUserCouponDTO extends PaginationParamsDTO {
  @OptionalSwagger()
  userId?: Id;
}
