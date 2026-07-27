import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaginationParamsDTO } from './pagination-params.dto';

export class FiltrationParamsDTO extends PaginationParamsDTO {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  search?: string;
}
