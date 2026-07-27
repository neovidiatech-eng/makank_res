import { PartialType } from '@nestjs/swagger';
import { RequiredFile } from 'src/_modules/media/decorators/upload.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { ValidateUnique } from 'src/decorators/dto/validators/validate-unique-number.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateSocialMediaDTO {
  @Required()
  @ValidateString()
  @ValidateUnique<'socialMedia'>({
    model: 'socialMedia',
    message: 'platform_already_exist',
  })
  platform: string;

  @Required()
  link: string;

  @RequiredFile()
  image: string;

  @Required()
  @ValidateBoolean()
  isActive: boolean;
}
export class UpdateSocialMediaDTO extends PartialType(CreateSocialMediaDTO) {}

export class FilterSocialMediaDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  platform?: string;

  @Optional()
  @ValidateBoolean()
  isActive?: boolean;
}
