import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateObject } from 'src/decorators/dto/validators/validate-nested.decorator';
import {
  ValidateString,
  ValidateStringArray,
} from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';
import { ValidateModelAndField } from '../decorators/validateModels.decorator';

export class SearchDTOForModel extends PaginationParamsDTO {
  @Required()
  @ValidateString()
  model: string;

  @Required({ isArray: true })
  @ValidateStringArray()
  fields: string[];

  @Required()
  @ValidateString()
  @ValidateModelAndField({ message: 'Invalid model/field combination' })
  value: string;
}

export class FilterSearchDTO {
  @Required({ type: SearchDTOForModel, isArray: true })
  @ValidateObject(SearchDTOForModel, true)
  models: SearchDTOForModel[];
}
