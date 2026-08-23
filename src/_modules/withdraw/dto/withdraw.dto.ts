import { ApiProperty } from '@nestjs/swagger';
import { PayoutMethod, WithdrawStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsOptional, Min } from 'class-validator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class FilterWithdrawDTO extends PaginationParamsDTO {
  @ApiProperty()
  @IsOptional()
  @Transform(({ value }) => +value)
  id?: Id;

  @ApiProperty()
  @IsOptional()
  @Transform(({ value }) => +value)
  branchId?: Id;

  @ApiProperty()
  @IsOptional()
  @Transform(({ value }) => +value)
  storeId?: Id;

  @Optional()
  @ValidateEnum(WithdrawStatus)
  status?: WithdrawStatus;
}
export class CreateWithdrawDTO {
  @Required()
  @ValidateNumber()
  @Min(1)
  amount: number;

  @Required()
  @ValidateEnum(PayoutMethod)
  @ApiProperty({ enum: PayoutMethod, example: PayoutMethod.VODAFONE_CASH })
  payoutMethod: PayoutMethod;

  @Required()
  @Transform(({ value }) => {
    if (typeof value === 'object' && value !== null) {
      if (value.accountNumber) {
        return value.name ? `${value.accountNumber} - ${value.name}` : String(value.accountNumber);
      }
      return JSON.stringify(value);
    }
    return value ? String(value) : '';
  })
  @ValidateString()
  @ApiProperty({ example: '01012345678' })
  payoutDetails: string;

  @Optional()
  @Transform(({ value }) => (value ? +value : undefined))
  branchId?: number;

  @OptionalSwagger()
  storeId?: number;
}
export class UpdateWithdrawDTO {
  @Required()
  @ValidateEnum([WithdrawStatus.APPROVED, WithdrawStatus.DENIED])
  status: WithdrawStatus;
}
