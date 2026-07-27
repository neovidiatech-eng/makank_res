import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { ValidateDate } from 'src/decorators/dto/validators/validate-date.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';

export class OrderStatusCountFilterDTO {
  @Optional()
  @ValidateNumber({ allowNegative: false })
  branchId?: Id;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  storeId?: Id;
  @Optional()
  @ValidateString()
  serviceOrClientName?: string;
  @Optional()
  @ValidateDate()
  fromDate?: string;
  @Optional()
  @ValidateDate()
  toDate?: string;
}

export class FilterStoreWalletDTO {
  @Optional()
  @ValidateNumber()
  branchId?: Id;

  @Optional()
  @ValidateNumber()
  storeId?: Id;

  @Optional()
  @ValidateNumber()
  specialistId?: Id;
}
