import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { Days } from '@prisma/client';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateDate } from 'src/decorators/dto/validators/validate-date.decorator';
import { ValidateEmail } from 'src/decorators/dto/validators/validate-email.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidatePassword } from 'src/decorators/dto/validators/validate-password.decorator';
import { ValidatePhone } from 'src/decorators/dto/validators/validate-phone.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { ValidateTime } from 'src/decorators/dto/validators/validate-time.decorator';

class Schedule {
  @Required()
  @ValidateEnum(Days)
  day: Days;

  @Required()
  @ValidateTime({
    description:
      'Egypt (Africa/Cairo) wall-clock opening time, 24-hour "HH:mm" (e.g. "09:00"). Stored ' +
      'literally as the wall-clock — no timezone conversion.',
    example: '09:00',
  })
  openingTime: string;

  @Required()
  @ValidateTime({
    description:
      'Egypt (Africa/Cairo) wall-clock closing time, 24-hour "HH:mm" (e.g. "17:00"). Stored ' +
      'literally as the wall-clock — no timezone conversion.',
    example: '17:00',
  })
  closingTime: string;

  @Optional()
  @ValidateNumber()
  requiredLat?: number;

  @Optional()
  @ValidateNumber()
  requiredLng?: number;

  @Optional()
  @ValidateNumber()
  requiredRadius?: number;
}

export class DeliveryScheduleDTO {
  @Required({ type: Schedule, isArray: true })
  schedule: Schedule[];
}

export class CreateDeliveryDTO {
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

  @Optional()
  @ValidateBoolean()
  forceAvailable?: boolean;
}

export class UpdateDeliveryDTO extends OmitType(
  PartialType(CreateDeliveryDTO),
  ['password'],
) {
  @Optional()
  @ValidateBoolean()
  active?: boolean;

  @Optional()
  @ValidateBoolean()
  forceAvailable?: boolean;

  // Admin-only manual verification gate. No longer set automatically by the
  // driver's own OTP/email-verification flow (see base.authentication.service
  // .verify()) — a driver can log in and use the app unverified, but won't be
  // considered for order assignment until an admin flips this on.
  @Optional()
  @ValidateBoolean()
  verified?: boolean;

  @Optional()
  @ValidateBoolean()
  isOnShift?: boolean;

  @Optional()
  @ValidateBoolean()
  availableNow?: boolean;
}

import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export enum DriverOrderFilterEnum {
  MOST_DELIVERED = 'MOST_DELIVERED',
  LEAST_DELIVERED = 'LEAST_DELIVERED',
  MOST_TODAY = 'MOST_TODAY',
  ZERO_DELIVERED = 'ZERO_DELIVERED',
  MOST_REJECTED = 'MOST_REJECTED',
  MOST_EARNINGS = 'MOST_EARNINGS',
}

export class GetDeliveriesDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateString()
  search?: string;

  @Optional()
  @ValidateBoolean()
  active?: boolean;

  @Optional()
  @ValidateBoolean()
  availableNow?: boolean;

  @Optional()
  @ValidateBoolean()
  bestRated?: boolean;

  @Optional()
  @ValidateBoolean()
  forceAvailable?: boolean;

  @Optional({ enum: DriverOrderFilterEnum })
  @ValidateEnum(DriverOrderFilterEnum)
  orderFilter?: DriverOrderFilterEnum;

  @Optional()
  @ValidateBoolean()
  zeroOrdersOnly?: boolean;

  @Optional()
  @ValidateBoolean()
  onShiftOnly?: boolean;

  @Optional()
  @ValidateBoolean()
  includeStats?: boolean;

  @Optional()
  @ValidateString()
  q?: string;

  @Optional()
  @ValidateString()
  fromDate?: string;

  @Optional()
  @ValidateString()
  toDate?: string;

  @Optional()
  @ValidateString()
  date?: string;

  @Optional()
  @ValidateString()
  periodFilter?: string;
}

export class GetDeliveryStatisticsDTO {
  @Optional()
  @ValidateDate()
  fromDate?: Date;

  @Optional()
  @ValidateDate()
  toDate?: Date;
}

export class GetDriverDashboardDTO {
  @Optional()
  @ValidateDate()
  date?: Date;

  @Optional()
  @ValidateDate()
  fromDate?: Date;

  @Optional()
  @ValidateDate()
  toDate?: Date;
}

export class CreateDeliveryScheduleDTO {
  @Required()
  @ValidateTime({
    description:
      'Egypt (Africa/Cairo) wall-clock opening time, 24-hour "HH:mm" (e.g. "09:00"). Stored ' +
      'literally as the wall-clock — no timezone conversion.',
    example: '09:00',
  })
  openingTime: string;

  @Required()
  @ValidateTime({
    description:
      'Egypt (Africa/Cairo) wall-clock closing time, 24-hour "HH:mm" (e.g. "17:00"). Stored ' +
      'literally as the wall-clock — no timezone conversion.',
    example: '17:00',
  })
  closingTime: string;

  @ApiProperty()
  @ValidateEnum(Days)
  day: Days;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  deliveryId: number;

  @Optional()
  @ValidateNumber()
  requiredLat?: number;

  @Optional()
  @ValidateNumber()
  requiredLng?: number;

  @Optional()
  @ValidateNumber()
  requiredRadius?: number;
}

export class CheckInDTO {
  @Required()
  @ValidateNumber()
  lat: number;

  @Required()
  @ValidateNumber()
  lng: number;
}

export class UpdateDeliveryLocationDTO {
  @Required()
  @ValidateNumber()
  lat: number;

  @Required()
  @ValidateNumber()
  lng: number;

  @Optional()
  @ValidateNumber()
  bearing?: number;
}
