import { ApiProperty } from '@nestjs/swagger';
import { Days } from '@prisma/client';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateDate } from 'src/decorators/dto/validators/validate-date.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateTime } from 'src/decorators/dto/validators/validate-time.decorator';
// NOTE: schedule open/close times are an Egypt (Africa/Cairo) wall-clock `HH:mm` string,
// stored literally (Option A). They are NOT instants — see docs/timezone-handling.md.
import { EnumArrayFilter } from 'src/decorators/filters/enum.filter.decorator';

export class CreateScheduleDTO {
  @Required({})
  @ValidateTime({
    description:
      'Egypt (Africa/Cairo) wall-clock opening time, 24-hour "HH:mm" (e.g. "09:00"). Stored ' +
      'literally as the wall-clock — no timezone conversion.',
    example: '09:00',
  })
  openingTime: string;

  @Required({})
  @ValidateTime({
    description:
      'Egypt (Africa/Cairo) wall-clock closing time, 24-hour "HH:mm" (e.g. "17:00"). Stored ' +
      'literally as the wall-clock — no timezone conversion.',
    example: '17:00',
  })
  closingTime: string;

  @ApiProperty()
  @EnumArrayFilter(Days, 'Day', 'Choose day')
  day: Days;
  @Optional()
  @ValidateNumber({ allowNegative: false })
  @ValidateExist<'branch'>({ model: 'branch' })
  branchId: Id;
}

export class RequiredIdDateParam {
  @Required()
  @ValidateNumber()
  id: Id;
  @Required()
  @ValidateDate()
  date: Date;
}

export class UpdateStoreScheduleDTO {
  @Required({ type: CreateScheduleDTO, isArray: true })
  schedules: CreateScheduleDTO[];
}
