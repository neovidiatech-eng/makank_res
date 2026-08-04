import { PartialType } from '@nestjs/swagger';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateCityDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Optional()
  @ValidateNumber()
  lat?: number;

  @Optional()
  @ValidateNumber()
  lng?: number;

  @Optional()
  @ValidateNumber()
  radius?: number;

  @Optional()
  @ValidateNumber()
  toleranceRadius?: number;

  @Optional({
    example: [
      { lat: 30.0444, lng: 31.2357 },
      { lat: 30.05, lng: 31.24 },
      { lat: 30.04, lng: 31.25 },
    ],
  })
  coordinates?: Json;

  // Turning a city off removes every one of its stores from the customer
  // app (see StoreService.findAll) — not just this city's own listing.
  @Optional()
  @ValidateBoolean()
  active?: boolean;
}
export class UpdateCityDTO extends PartialType(CreateCityDTO) {}

export class FilterCityDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  name?: string;

  @Optional()
  @ValidateBoolean()
  active?: boolean;
}
