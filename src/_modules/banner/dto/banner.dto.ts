import { ApiProperty, PartialType } from '@nestjs/swagger';
import { BannerTargetType } from '@prisma/client';
import {
  IsUrl,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { RequiredFile } from 'src/_modules/media/decorators/upload.decorator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateDate } from 'src/decorators/dto/validators/validate-date.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import {
  ValidateNumber,
  ValidateNumberArray,
} from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

// Cross-field validator: endDate must be strictly after startDate (when both
// are provided). Mirrors the campaign module's IsAfterStartAt.
@ValidatorConstraint({ name: 'isAfterBannerStartDate', async: false })
class IsAfterStartDateConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const start = (args.object as any).startDate;
    if (!value || !start) return true;
    return new Date(value).getTime() > new Date(start).getTime();
  }
  defaultMessage() {
    return 'endDate must be after startDate';
  }
}
function IsAfterStartDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsAfterStartDateConstraint,
    });
  };
}

export class CreateBannerDTO {
  @Required()
  @ValidateName({
    example: '{"ar":"بانر اختبار خدمة","en":"Test Service Banner"}',
  })
  name: Json;

  // All targeting fields below are optional. A GENERAL banner needs none of
  // them — send name, image, targetType, order and the date window only. Leave
  // these out entirely (do NOT send empty strings) when not targeting.
  @Optional({
    example: 1,
    description:
      'Optional. Target a specific store. Omit for a GENERAL banner.',
  })
  @ValidateNumber({ allowNegative: false })
  @ValidateExist<'store'>({ model: 'store' })
  storeId?: Id;

  // Middle targeting layer ("category / module from this store", Arabic: فئة).
  // Stored as the concrete Category model. Cross-entity hierarchy is validated
  // in the service (category must belong to the selected store's module).
  @Optional({
    example: 2,
    description:
      'Optional. Requires storeId. Category must belong to the store.',
  })
  @ValidateNumber({ allowNegative: false })
  @ValidateExist<'category'>({ model: 'category' })
  categoryId?: Id;

  // Product / service / item (Arabic: منتجات). Stored as the Service model.
  // Validated in the service to belong to the selected store (and category).
  @Optional({
    example: 3,
    description:
      'Optional. Requires storeId. Service must belong to the store (and category if sent).',
  })
  @ValidateNumber({ allowNegative: false })
  @ValidateExist<'service'>({ model: 'service' })
  serviceId?: Id;

  // Zone / area targeting (Arabic: منطقة). Allowed zones are those reachable
  // through the selected store's branches (Store -> Branch -> BranchZone -> Zone).
  @Optional()
  @ValidateNumberArray({ allowNegative: false })
  @ValidateExist<'zone'>({ model: 'zone', isArray: true })
  @ApiProperty({
    required: false,
    type: [Number],
    example: [1, 2],
    description:
      'Optional. Requires storeId. Zones must be linked to the store branches. Omit for a GENERAL banner.',
  })
  zoneIds?: Id[];

  // Explicit placement/routing type. SPECIAL_DRIVER routes the customer to the
  // special-driver (مندوب خاص) flow. EXTERNAL_URL opens clickUrl in an
  // external browser/webview instead of navigating in-app. Defaults to
  // GENERAL at the DB level.
  @Optional()
  @ValidateEnum(BannerTargetType)
  targetType?: BannerTargetType;

  // Required when targetType is EXTERNAL_URL, forbidden otherwise — validated
  // in BannerService (mirrors AdminNotificationService.validateClickUrl).
  @Optional({
    description: 'Required when targetType is EXTERNAL_URL. Must be http(s).',
  })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  clickUrl?: string;

  // Display order (ascending). Lower shows first. Defaults to 0 at the DB level.
  @Optional({ example: 1 })
  @ValidateNumber({ allowNegative: false })
  order?: number;

  // Scheduling window. A banner is shown to customers only while
  // startDate <= now <= endDate (each bound optional / open-ended).
  @Optional()
  @ValidateDate()
  startDate?: Date;

  @Optional()
  @ValidateDate()
  @IsAfterStartDate()
  endDate?: Date;

  @RequiredFile()
  image: string;
}
export class UpdateBannerDTO extends PartialType(CreateBannerDTO) {
  @Optional()
  @ValidateBoolean()
  active: boolean;
}

export class SortBannerDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;

  @SortProp()
  name?: SortOptions;

  @SortProp()
  storeId?: SortOptions;

  @SortProp()
  image?: SortOptions;

  @SortProp()
  active?: SortOptions;

  @SortProp()
  clickCount?: SortOptions;

  @SortProp()
  order?: SortOptions;

  @SortProp()
  startDate?: SortOptions;

  @SortProp()
  endDate?: SortOptions;

  @SortProp()
  createdAt?: SortOptions;

  @SortProp()
  randomSeed?: SortOptions;
}
export class FilterBannerDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  name?: string;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  storeId?: Id;
  @Optional()
  @ValidateNumber({ allowNegative: false })
  categoryId?: Id;
  @Optional()
  @ValidateNumber({ allowNegative: false })
  serviceId?: Id;
  @Optional()
  @ValidateEnum(BannerTargetType)
  targetType?: BannerTargetType;
  @Optional()
  @ValidateBoolean()
  active?: boolean;

  @Optional()
  orderBy?: SortBannerDTO[];
}
