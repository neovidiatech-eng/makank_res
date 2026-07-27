import { IsString } from 'class-validator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';

export class LocalizedNameDTO {
  @Required({})
  @IsString()
  nameDefault: string;

  @Optional()
  @IsString()
  nameAr?: string;

  @Optional()
  @IsString()
  nameEn?: string;
}
