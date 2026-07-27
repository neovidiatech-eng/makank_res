import { PartialType } from '@nestjs/swagger';
import {
  CampaignStatus,
  CampaignTargetType,
  CampaignType,
} from '@prisma/client';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { OptionalFile } from 'src/_modules/media/decorators/upload.decorator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { ValidateDate } from 'src/decorators/dto/validators/validate-date.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import {
  ValidateNumber,
  ValidateNumberArray,
} from 'src/decorators/dto/validators/validate-number.decorator';
import { RequiredIf } from 'src/decorators/dto/validators/validate-requiredIf,decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

// Derived campaign lifecycle status (computed, not stored) — used only for list filtering.
export const CAMPAIGN_DERIVED_STATUS = [
  'active',
  'scheduled',
  'expired',
  'inactive',
] as const;
export type CampaignDerivedStatus = (typeof CAMPAIGN_DERIVED_STATUS)[number];

// Cross-field validator: endAt must be strictly after startAt (when both provided).
@ValidatorConstraint({ name: 'isAfterStartAt', async: false })
class IsAfterStartAtConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const start = (args.object as any).startAt;
    if (!value || !start) return true;
    return new Date(value).getTime() > new Date(start).getTime();
  }
  defaultMessage() {
    return 'endAt must be after startAt';
  }
}
function IsAfterStartAt(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsAfterStartAtConstraint,
    });
  };
}

export class CreateCampaignDTO {
  @Required()
  @ValidateEnum(CampaignType)
  type: CampaignType;

  @Required()
  @ValidateName()
  title: Json;

  // Required for NOTIFICATION campaigns (description is the notification body).
  @Optional()
  @ValidateName()
  @RequiredIf(
    (o: CreateCampaignDTO) => o.type === CampaignType.NOTIFICATION,
    'type',
    { message: 'description is required for NOTIFICATION campaigns' },
  )
  description?: Json;

  @Optional()
  @ValidateName()
  featureText?: Json;

  @Optional()
  @ValidateName()
  valueText?: Json;

  // Image is uploaded via multipart ('image' field) and required for OFFER popups.
  // The hard requirement is enforced in the service (the interceptor populates this).
  @OptionalFile()
  image?: string;

  // Audience mode. v1 only restricts the audience for SELECTED_USERS; ALL,
  // CUSTOMER, STORE and SERVICE all reach every customer. STORE/SERVICE are kept
  // as offer-context modes (they pair with storeId/serviceId metadata) and do
  // NOT filter recipients in v1.
  @Optional()
  @ValidateEnum(CampaignTargetType)
  targetType?: CampaignTargetType;

  // Required when targetType = SELECTED_USERS. Customer-role enforcement happens at dispatch.
  @Optional()
  @ValidateNumberArray({ allowNegative: false })
  @RequiredIf(
    (o: CreateCampaignDTO) =>
      o.targetType === CampaignTargetType.SELECTED_USERS,
    'targetType',
    { message: 'targetUserIds is required when targetType is SELECTED_USERS' },
  )
  targetUserIds?: Id[];

  // Offer context / deep-link target — "tap to open this store". Not an audience
  // filter in v1. Required only to ensure STORE-mode offers actually carry a store.
  @Optional()
  @ValidateNumber({ allowNegative: false })
  @ValidateExist<'store'>({ model: 'store' })
  @RequiredIf(
    (o: CreateCampaignDTO) => o.targetType === CampaignTargetType.STORE,
    'targetType',
    { message: 'storeId is required when targetType is STORE' },
  )
  storeId?: Id;

  // Offer context / deep-link target — "tap to open this service". Not an audience
  // filter in v1. Required only to ensure SERVICE-mode offers actually carry a service.
  @Optional()
  @ValidateNumber({ allowNegative: false })
  @ValidateExist<'service'>({ model: 'service' })
  @RequiredIf(
    (o: CreateCampaignDTO) => o.targetType === CampaignTargetType.SERVICE,
    'targetType',
    { message: 'serviceId is required when targetType is SERVICE' },
  )
  serviceId?: Id;

  // Deep-link target for SPECIAL_DRIVER campaigns: "tap to open this driver's profile" or a flow string.
  // Required when targetType = SPECIAL_DRIVER.
  @Optional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return String(value);
  })
  @IsString()
  @RequiredIf(
    (o: CreateCampaignDTO) =>
      o.targetType === CampaignTargetType.SPECIAL_DRIVER,
    'targetType',
    { message: 'deliveryId is required when targetType is SPECIAL_DRIVER' },
  )
  deliveryId?: string;

  @Optional()
  @ValidateDate()
  startAt?: Date;

  @Optional()
  @ValidateDate()
  @IsAfterStartAt()
  endAt?: Date;

  // Per-user popup frequency cap. If omitted, the customer endpoint applies a
  // 24h default cap (it is never "show on every app open"). Set 0 to opt into
  // showing on every fetch.
  @Optional()
  @ValidateNumber({ allowNegative: false })
  displayIntervalHours?: number;
}

export class UpdateCampaignDTO extends PartialType(CreateCampaignDTO) {}

export class UpdateCampaignStatusDTO {
  @Required()
  @ValidateEnum(CampaignStatus)
  manualStatus: CampaignStatus;
}

export class SortCampaignDTO {
  @SortProp()
  id?: SortOptions;

  @SortProp()
  createdAt?: SortOptions;

  @SortProp()
  startAt?: SortOptions;

  @SortProp()
  endAt?: SortOptions;
}

export class FilterCampaignDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  title?: string;

  @Optional()
  @ValidateEnum(CampaignType)
  type?: CampaignType;

  // Derived status filter: active | scheduled | expired | inactive.
  @Optional()
  @ValidateEnum(CAMPAIGN_DERIVED_STATUS, true)
  status?: CampaignDerivedStatus;

  @Optional()
  @ValidateDate()
  dateFrom?: Date;

  @Optional()
  @ValidateDate()
  dateTo?: Date;

  @Optional()
  orderBy?: SortCampaignDTO[];
}
