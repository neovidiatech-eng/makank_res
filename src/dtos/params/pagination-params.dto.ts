import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber } from 'class-validator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';

export class PaginationParamsDTO {
  @Optional()
  @IsNotEmpty()
  @Transform(({ value }) => +value)
  @IsNumber()
  page?: number;

  @Optional()
  @IsNotEmpty()
  @Transform(({ value }) => +value)
  @IsNumber()
  limit?: number;
}
export class FilterPaginationWithId extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber({ allowNegative: false })
  id?: number;
}
