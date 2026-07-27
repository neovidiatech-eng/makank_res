import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';

// Body for POST /orders/:id/reorder. Items/bundles are re-read from the
// original order server-side — only the things a customer re-decides at
// checkout time (payment, address, note) are accepted here.
export class ReorderDTO {
  @Required()
  @ValidateEnum(PaymentMethod)
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @Optional()
  @ValidateBoolean()
  @ApiProperty({ example: false, required: false })
  paidWithWallet?: boolean;

  @Optional()
  @ValidateNumber()
  @ApiProperty({
    required: false,
    description: "Defaults to the original order's address if omitted",
  })
  addressId?: Id;

  @Optional()
  @ValidateString()
  @ApiProperty({ required: false })
  note?: string;
}
