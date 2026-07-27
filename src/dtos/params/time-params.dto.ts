import { Transform } from 'class-transformer';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { PaginationParamsDTO } from './pagination-params.dto';

export class FilterByTimeDTO extends PaginationParamsDTO {
  @Optional({ example: new Date() })
  @Transform(({ value }) => new Date(value))
  from?: Date;

  @Optional({ example: new Date() })
  @Transform(({ value }) => new Date(value))
  to?: Date;
}
