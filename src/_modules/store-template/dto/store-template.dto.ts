import { ApiProperty, PartialType } from '@nestjs/swagger';
import { OptionalFile } from 'src/_modules/media/decorators/upload.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { LessThanField } from 'src/decorators/dto/validators/less-than-field.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateObject } from 'src/decorators/dto/validators/validate-nested.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class TemplateSizeSDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Required()
  @ValidateNumber()
  price: number;

  @Optional()
  @ValidateNumber()
  @LessThanField('price')
  priceAfterDiscount?: number;

  @Optional()
  @ValidateBoolean()
  isDefault?: boolean;
}

export class TemplateAddonDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Required()
  @ValidateNumber()
  price: number;
}

export class TemplateServiceDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Required()
  @ValidateName()
  description: Json;

  @Required()
  @ValidateString()
  image: string;

  @Required()
  @ValidateNumber()
  durationMinutes: number;

  @Required()
  @ValidateNumber()
  price: number;

  @Optional()
  @ValidateNumber()
  @LessThanField('price')
  priceAfterDiscount?: number;

  @Optional()
  @ValidateNumber()
  commission?: number;

  @Optional()
  @ValidateBoolean()
  available?: boolean;

  @Optional()
  @ValidateBoolean()
  bestRated?: boolean;

  @Optional()
  @ValidateBoolean()
  mostSeller?: boolean;

  @Required({ type: TemplateSizeSDTO, isArray: true })
  @ValidateObject(TemplateSizeSDTO, true)
  sizes: TemplateSizeSDTO[];

  @Optional({ type: TemplateAddonDTO, isArray: true })
  @ValidateObject(TemplateAddonDTO, true)
  addons?: TemplateAddonDTO[];
}

export class TemplateCategoryDTO {
  @Required()
  @ValidateName()
  name: Json;

  // Uploaded as a file via the dedicated category endpoints (interceptor populates
  // this). When this DTO is nested inside a template-create payload there is no
  // upload, so a bare string here is dropped by ValidateImage — category images are
  // set through POST/PATCH /store-templates/categories.
  @OptionalFile()
  image?: string;

  @Optional()
  @ValidateNumber()
  order?: number;

  @Optional({ type: TemplateServiceDTO, isArray: true })
  @ValidateObject(TemplateServiceDTO, true)
  services?: TemplateServiceDTO[];
}

export class CreateTemplateCategoryDTO extends TemplateCategoryDTO {}

export class UpdateTemplateCategoryDTO extends PartialType(
  CreateTemplateCategoryDTO,
) {}

export class CreateStoreTemplateDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Optional()
  @ValidateName()
  description?: Json;

  // Template's own image, uploaded as a file on create/update.
  @OptionalFile()
  image?: string;

  @Optional()
  @ValidateString()
  moduleType?: string;

  @Optional()
  @ValidateNumber()
  order?: number;

  // Optional at creation: create the template (and its own image) first, then add
  // categories — with their images — via POST/PATCH /store-templates/categories.
  @Optional({ type: TemplateCategoryDTO, isArray: true })
  @ValidateObject(TemplateCategoryDTO, true)
  categories?: TemplateCategoryDTO[];
}

export class UpdateStoreTemplateDTO extends PartialType(
  CreateStoreTemplateDTO,
) {
  @Optional()
  @ValidateBoolean()
  active?: boolean;
}

export class ApplyTemplateDTO {
  @Required()
  @ValidateNumber()
  templateId: number;
}

export class SortStoreTemplateDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;

  @SortProp()
  @ApiProperty({ example: 'asc' })
  order?: SortOptions;
}

export class FilterStoreTemplateDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  moduleType?: string;

  @Optional()
  @ValidateBoolean()
  active?: boolean;

  @Optional()
  orderBy?: SortStoreTemplateDTO[];

  @Optional()
  @ValidateBoolean()
  isCustomStoreCategory?: boolean;
}

export class FilterTemplateCategoryDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateNumber()
  templateId?: Id;

  @Optional()
  @ValidateString()
  name?: string;
  @Optional()
  @ValidateBoolean()
  isCustomStoreCategory?: boolean;
}
