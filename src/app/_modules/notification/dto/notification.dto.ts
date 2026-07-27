import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class FilterNotificationDTO extends PaginationParamsDTO {
  @OptionalSwagger()
  userId: Id;
}
