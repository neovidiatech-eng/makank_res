import { ComplaintStatus } from '@prisma/client';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateComplaintDTO {
  @Required()
  @ValidateNumber({ allowNegative: false })
  orderId: Id;

  @Required()
  @ValidateString()
  reason: string;

  @OptionalSwagger()
  userId?: Id;
}

export class UpdateComplaintStatusDTO {
  @Required()
  @ValidateEnum(ComplaintStatus)
  status: ComplaintStatus;
}

export class FilterComplaintDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateNumber()
  orderId?: Id;

  @Optional()
  @ValidateNumber()
  userId?: Id;

  @Optional()
  @ValidateEnum(ComplaintStatus)
  status?: ComplaintStatus;
}

export class CreateComplaintReplyDTO {
  @Required()
  @ValidateString()
  message: string;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  userId?: Id;
}
