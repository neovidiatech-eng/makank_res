import { ApiProperty, PartialType } from '@nestjs/swagger';
import { RequiredFile } from 'src/_modules/media/decorators/upload.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { ValidateUnique } from 'src/decorators/dto/validators/validate-unique-number.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateLanguagesDTO {
  @Required()
  name: string;

  @Required()
  @ValidateUnique<'language'>({ model: 'language' })
  key: string;

  @RequiredFile()
  @ApiProperty({ description: 'Json only allowed' })
  file: string;

  @RequiredFile()
  @ApiProperty({ description: 'Json only allowed' })
  frontFile: string;
}
export class UpdateLanguagesDTO extends PartialType(CreateLanguagesDTO) {}

export class SortLanguagesDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;

  @SortProp()
  name?: SortOptions;

  @SortProp()
  key?: SortOptions;
}
export class FilterLanguagesDTO extends PaginationParamsDTO {
  @Optional()
  name?: string;

  @Optional()
  key?: string;

  @Optional()
  orderBy?: SortLanguagesDTO[];
}
