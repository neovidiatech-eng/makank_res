import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { OptionalFile } from 'src/_modules/media/decorators/upload.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateEmail } from 'src/decorators/dto/validators/validate-email.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidatePassword } from 'src/decorators/dto/validators/validate-password.decorator';
import { ValidatePhone } from 'src/decorators/dto/validators/validate-phone.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateEmployeeDTO {
  @Required()
  @ValidateString()
  name: string;

  @Required()
  @ValidateEmail()
  email: string;

  @Optional()
  @ValidatePhone()
  phone?: string;

  @Required()
  @ValidatePassword()
  password: string;

  @Required()
  @ValidateNumber()
  @ValidateExist<'role'>({
    model: 'role',
  })
  roleId: Id;
  @Optional()
  @ValidateNumber()
  @ValidateExist<'store'>({
    model: 'store',
  })
  storeId: Id;

  // Which branch of the store this employee belongs to — without it, the
  // employee's order list/notifications (both scoped by branchId) would
  // never match anything. Optional here only because it can be auto-resolved
  // to the store's sole branch; EmployeeService.create() enforces it's
  // present (explicitly or resolved) before the row is written.
  @Optional()
  @ValidateNumber()
  @ValidateExist<'branch'>({
    model: 'branch',
  })
  branchId?: Id;
}
export class UpdateEmployeeDTO extends OmitType(
  PartialType(CreateEmployeeDTO),
  ['password', 'storeId'],
) {
  @Optional()
  @ValidateString()
  deviceId: string;

  @Optional()
  @ValidateString()
  fcm: string;
  @OptionalFile()
  image: string;
  @Optional()
  @ValidateBoolean()
  allowNotification: boolean;
  @Optional()
  @ValidateBoolean()
  male: boolean;
}
export class SortBannerDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;

  @SortProp()
  name?: SortOptions;

  @SortProp()
  storeId?: SortOptions;

  @SortProp()
  image?: SortOptions;

  @SortProp()
  active?: SortOptions;

  @SortProp()
  randomSeed?: SortOptions;
}
export class FilterEmployeeDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  name?: string;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  storeId?: Id;

  @Optional()
  @ValidateBoolean()
  active?: boolean;

  @Optional()
  orderBy?: SortBannerDTO[];
}
