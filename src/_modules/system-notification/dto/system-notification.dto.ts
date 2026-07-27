import { PartialType } from '@nestjs/swagger';
import { SystemNotificationStatus } from '@prisma/client';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export class CreateSystemNotificationDTO {
  @Optional()
  @ValidateEnum(SystemNotificationStatus)
  email?: SystemNotificationStatus;

  @Optional()
  @ValidateEnum(SystemNotificationStatus)
  sms?: SystemNotificationStatus;

  @Optional()
  @ValidateEnum(SystemNotificationStatus)
  notification?: SystemNotificationStatus;
}
export class UpdateSystemNotificationDTO extends PartialType(
  CreateSystemNotificationDTO,
) {}

export class FilterSystemNotificationDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;
}
