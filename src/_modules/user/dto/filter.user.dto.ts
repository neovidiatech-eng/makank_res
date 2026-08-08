import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';

export enum UserOrderFilterEnum {
  MOST_ORDERS = 'MOST_ORDERS',
  LEAST_ORDERS = 'LEAST_ORDERS',
  ZERO_ORDERS = 'ZERO_ORDERS',
  MOST_CANCELLED = 'MOST_CANCELLED',
}

export class FilterUserDTO extends PaginationParamsDTO {
  @Optional({})
  @ValidateNumber({ allowNegative: false })
  id?: Id;

  @Optional({})
  @ValidateString()
  name?: string;

  @Optional()
  @ValidateString()
  email?: string;

  @Optional()
  @ValidateString()
  phone?: string;

  @Optional()
  roleId?: Id;

  @OptionalSwagger()
  roleKey?: string;

  @OptionalSwagger()
  storeId?: Id;

  @Optional({ enum: UserOrderFilterEnum })
  @ValidateEnum(UserOrderFilterEnum)
  orderFilter?: UserOrderFilterEnum;

  @Optional()
  @ValidateBoolean()
  zeroOrdersOnly?: boolean;

  @Optional()
  @ValidateBoolean()
  includeStats?: boolean;
}

