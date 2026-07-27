import { PayoutMethod, WithdrawStatus } from '@prisma/client';
import { Min } from 'class-validator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateDriverWithdrawDTO {
  @Required()
  @ValidateNumber()
  @Min(1)
  amount: number;

  @Required()
  @ValidateEnum(PayoutMethod)
  payoutMethod: PayoutMethod;

  @Required()
  @ValidateString()
  payoutDetails: string;
}

export class UpdateDriverWithdrawDTO {
  @Required()
  @ValidateEnum([WithdrawStatus.APPROVED, WithdrawStatus.DENIED])
  status: WithdrawStatus;

  @Optional()
  @ValidateString()
  adminNote?: string;
}

export class FilterDriverWithdrawDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateNumber()
  deliveryId?: Id;

  @Optional()
  @ValidateEnum(WithdrawStatus)
  status?: WithdrawStatus;
}
