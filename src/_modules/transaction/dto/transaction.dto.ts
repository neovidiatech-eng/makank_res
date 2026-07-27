import { TransactionType } from '@prisma/client';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateDate } from 'src/decorators/dto/validators/validate-date.decorator';
import {
  ValidateNumber,
  ValidateNumberArray,
} from 'src/decorators/dto/validators/validate-number.decorator';
import { EnumArrayFilter } from 'src/decorators/filters/enum.filter.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateTransactionDTO {
  @Required()
  @ValidateNumber()
  balance: number;

  @Optional()
  @ValidateNumber()
  userId?: Id;

  @Optional()
  @ValidateNumber()
  branchId?: Id;

  @Optional()
  @ValidateNumber()
  deliveryId?: Id;

  @Required()
  @ValidateNumber()
  referenceId: number;

  @Required()
  @ValidateEnum(TransactionType)
  type: TransactionType;

  @Optional()
  @ValidateNumber()
  adminCommission?: number;
}

export class FilterTransactionDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumberArray()
  id?: Id | Id[];

  @Optional()
  @ValidateNumberArray()
  customerId?: Id | Id[];

  @Optional()
  @ValidateNumber()
  branchId: Id;

  @Optional()
  @ValidateNumber()
  deliveryId?: Id;

  @Optional()
  @ValidateNumber()
  storeId?: Id;

  @Optional()
  @EnumArrayFilter(TransactionType, 'Type', 'Transaction Type')
  type?: TransactionType[];

  @Optional({ example: new Date() })
  @ValidateDate()
  transactionDateFrom?: Date;

  @Optional({ example: new Date() })
  @ValidateDate()
  transactionDateTo?: Date;
}
