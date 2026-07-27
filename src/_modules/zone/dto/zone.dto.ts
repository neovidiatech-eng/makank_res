import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateZoneDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Required({
    example: [
      { lat: 24.7136, lng: 46.6753 },
      { lat: 24.72, lng: 46.68 },
      { lat: 24.715, lng: 46.69 },
    ],
  })
  coordinates: Json;

  // City this zone belongs to; an order's delivery city is derived through its zone.
  @Optional()
  @ValidateNumber({ allowNegative: false })
  cityId?: Id;

  // Fixed delivery price for this zone, app-wide. Omit/null to fall back to the
  // standard base-fee-plus-per-km calculation everywhere this zone is used.
  @Optional()
  @ValidateNumber({ allowNegative: false })
  @ApiProperty({
    required: false,
    example: 25,
    description:
      'Fixed delivery price for this zone (overrides the km-based formula app-wide). Omit for the standard calculation.',
  })
  deliveryPrice?: number;
}

export class UpdateZoneDTO extends PartialType(CreateZoneDTO) {
  @Optional()
  @ValidateBoolean()
  active?: boolean;
}

export class SortZoneDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;
}

export class FilterZoneDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  name?: string;

  @Optional()
  @ValidateBoolean()
  active?: boolean;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  cityId?: Id;

  @Optional()
  orderBy?: SortZoneDTO[];
}
