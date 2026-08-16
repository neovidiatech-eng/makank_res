import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { CommissionType } from '@prisma/client';
import { Type } from 'class-transformer';
import { Max, Min, ValidateNested } from 'class-validator';
import { PriceRangeDTO } from 'src/_modules/filter/dto/filter.dto';
import { RequiredFile } from 'src/_modules/media/decorators/upload.decorator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateEmail } from 'src/decorators/dto/validators/validate-email.decorator';
import { ValidateExist } from 'src/decorators/dto/validators/validate-found-number.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateObject } from 'src/decorators/dto/validators/validate-nested.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidatePassword } from 'src/decorators/dto/validators/validate-password.decorator';
import { ValidatePhone } from 'src/decorators/dto/validators/validate-phone.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';

export enum BranchStatus {
  OPEN = 'OPEN',
  BUSY = 'BUSY',
  CLOSED = 'CLOSED',
  NORMAL = 'NORMAL',
}
export class CreateStoreUserDTO {
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
}
export class CreateStoreDTO {
  @Required()
  @ValidateName()
  name: Json;

  @Required()
  @ValidateNumber()
  @ValidateExist<'storeTemplate'>({ model: 'storeTemplate' })
  templateId: Id;

  @RequiredFile()
  logo: string;

  @RequiredFile()
  cover: string;
  @Required()
  @Min(-90)
  @Max(90)
  @ValidateNumber({ allowNegative: true })
  lat: number;

  @Required()
  @ValidateNumber({ allowNegative: true })
  @Min(-180)
  @Max(180)
  lng: number;

  @Required()
  @ValidateString()
  address: string;

  @Required()
  @ValidateNumber()
  storeOrder: number;

  @Required()
  @ValidateObject(CreateStoreUserDTO)
  User: CreateStoreUserDTO;
}
// Every field optional, unlike CreateStoreUserDTO — PartialType(CreateStoreDTO)
// only makes the `User` property itself optional, it does NOT deep-partial the
// nested CreateStoreUserDTO's own required fields. Without this, an admin
// sending just { email, password } to change a store's login would get a 400
// ("name should not be empty") since `name`/`email`/`password` still validated
// as required on the nested object.
export class UpdateStoreUserDTO {
  @Optional()
  @ValidateString()
  name?: string;

  @Optional()
  @ValidateEmail()
  email?: string;

  @Optional()
  @ValidatePhone()
  phone?: string;

  @Optional()
  @ValidatePassword()
  password?: string;
}
// templateId is intentionally excluded: template application only happens via
// POST /stores/:id/apply-template, never silently through a store update.
// User is also excluded from the inherited shape (re-declared below with its
// own partial DTO) — TS won't let a subclass narrow an inherited property's
// type to one with optional fields where the base had required ones.
export class UpdateStoreDTO extends OmitType(PartialType(CreateStoreDTO), [
  'templateId',
  'User',
]) {
  @Optional()
  @ValidateObject(UpdateStoreUserDTO)
  User?: UpdateStoreUserDTO;

  @Optional()
  @ValidateBoolean()
  temporarilyClosed: boolean;

  @Optional()
  @ValidateNumber()
  storeOrder: number;

  @Optional()
  @ValidateBoolean()
  closed: boolean;

  @Optional()
  @ValidateBoolean()
  isVerified: boolean;

  @Optional()
  @ValidateEnum(BranchStatus)
  status: BranchStatus;

  @Optional()
  @ValidateNumber()
  busyMinutes: number;

  @Optional()
  @ValidateString()
  statusReason: string;

  // Static prep-time estimate shown to the customer on the store page —
  // free-form minutes, settable by the store itself or by an admin.
  @Optional()
  @ValidateNumber()
  prepTimeMinutes: number;

  // Delivery-time estimate range (minutes) shown alongside prep time —
  // settable by the store itself or by an admin, same as prepTimeMinutes.
  @Optional()
  @ValidateNumber()
  deliveryTimeMinMinutes: number;

  @Optional()
  @ValidateNumber()
  deliveryTimeMaxMinutes: number;

  // Minimum order subtotal — settable by the store itself or an admin, same
  // as prepTimeMinutes. Null/omitted means no minimum.
  @Optional()
  @ValidateNumber()
  minOrderAmount: number;
}

export class UpdateBranchStatusDTO {
  @Required()
  @ValidateEnum(BranchStatus)
  status: BranchStatus;

  @Optional()
  @ValidateNumber()
  busyMinutes?: number;

  // Shown to the customer while status is BUSY/CLOSED — e.g. "ضغط طلبات",
  // "انقطاع كهرباء", "نفاد خامات". Ignored (cleared) once status is OPEN/NORMAL.
  @Optional()
  @ValidateString()
  statusReason?: string;
}

export class SortStoreDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;

  @SortProp()
  @ApiProperty({
    example: 'asc',
    description: 'ترتيب المطعم اليدوي (storeOrder)',
  })
  storeOrder?: SortOptions;

  @SortProp()
  @ApiProperty({ example: 'asc' })
  rating?: SortOptions;

  @SortProp()
  @ApiProperty({ example: 'asc' })
  price?: SortOptions;

  @SortProp()
  @ApiProperty({ example: 'desc' })
  popular?: SortOptions;
}
export enum StoreOrderFilterEnum {
  MOST_ORDERS = 'MOST_ORDERS',
  LEAST_ORDERS = 'LEAST_ORDERS',
  ZERO_ORDERS = 'ZERO_ORDERS',
  MOST_CANCELLED = 'MOST_CANCELLED',
  MOST_REVENUE = 'MOST_REVENUE',
}

export class FilterStoreDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;

  @Optional()
  @ValidateString()
  name?: string;

  @Optional()
  @ValidateString()
  address?: string;

  @Optional()
  @ValidateNumber()
  rating?: number;

  @Optional()
  @ValidateBoolean()
  hasOffers?: boolean;

  @Optional()
  @ValidateBoolean()
  isStoreAccepted?: boolean;

  @Optional()
  @ValidateBoolean()
  active?: boolean;

  @Optional()
  @ValidateNumber()
  minRating?: number;

  @Optional()
  @ValidateBoolean()
  freeDelivery?: boolean;

  @Optional()
  @ValidateBoolean()
  isBlocked?: boolean;

  @Optional()
  @ValidateNumber()
  templateCategoryId?: Id;

  @Optional()
  @ValidateNumber()
  categoryId?: Id;

  @Optional()
  @ValidateNumber()
  templateId?: Id;

  @Optional()
  @ValidateNumber({ allowNegative: true })
  lat?: number;

  @Optional()
  @ValidateNumber({ allowNegative: true })
  lng?: number;

  @Optional()
  @ValidateNumber()
  @ValidateExist<'plan'>({ model: 'plan' })
  planId?: Id;

  @Optional()
  @ValidateNumber()
  @ValidateExist<'city'>({ model: 'city' })
  cityId?: Id;

  @Optional()
  @ValidateBoolean()
  isVerified?: boolean;

  @Optional()
  @ValidateBoolean()
  closed?: boolean;

  @Optional()
  @ValidateBoolean()
  temporarilyClosed?: boolean;

  @OptionalSwagger()
  favouriteCustomerId: Id;

  @Optional()
  @ValidateNumber()
  km: number;

  @Optional({ type: PriceRangeDTO })
  price?: PriceRangeDTO;

  @OptionalSwagger()
  @ValidateNumber()
  customerId: Id;

  @Optional({ enum: StoreOrderFilterEnum })
  @ValidateEnum(StoreOrderFilterEnum)
  orderFilter?: StoreOrderFilterEnum;

  @Optional()
  @ValidateBoolean()
  zeroOrdersOnly?: boolean;

  @Optional()
  @ValidateBoolean()
  includeStats?: boolean;

  @Optional()
  @ValidateString()
  search?: string;

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

  @Optional()
  orderBy?: SortStoreDTO[];
}

export class UpdateStoreCommissionDTO {
  @Required()
  @ValidateNumber()
  @Min(0)
  commission: number;

  // PERCENTAGE: `commission` is a percent of the base service/size price (0–100,
  // enforced in the service). FIXED: `commission` is a flat amount per unit.
  @Required({ enum: CommissionType })
  @ValidateEnum(CommissionType)
  commissionType: CommissionType;
}

export class SetStoreApprovalDTO {
  @Required()
  @ValidateBoolean()
  approved: boolean;

  @Optional()
  @ValidateString()
  reason?: string;
}

// Admin-only — see PATCH /stores/:id/zone-pricing/toggle. Never exposed on the
// generic store self-update endpoint.
export class ToggleStoreZonePricingDTO {
  @Required()
  @ValidateBoolean()
  enabled: boolean;
}

// Admin-only — see PATCH /stores/:id/managed-by-admin/toggle. Never exposed on
// the generic store self-update endpoint.
export class ToggleStoreManagedByAdminDTO {
  @Required()
  @ValidateBoolean()
  enabled: boolean;
}

// Bulk-discount the store's whole catalog (or just one category) in one call —
// store (own store) or admin. Overwrites any existing per-service discount;
// does not touch addons.
export class ApplyStoreDiscountDTO {
  @Required({ enum: CommissionType })
  @ValidateEnum(CommissionType)
  @ApiProperty({ enum: CommissionType, example: CommissionType.PERCENTAGE })
  discountType: CommissionType;

  // PERCENTAGE: 0–100. FIXED: any positive amount, in the store's currency.
  @Required()
  @ValidateNumber({ allowNegative: false })
  value: number;

  // Omit to discount the whole store catalog. Set to scope the discount to
  // only the services under this one category (must belong to this store).
  @Optional()
  @ValidateNumber({ allowNegative: false })
  @ApiProperty({
    required: false,
    description:
      'Limit the discount to one category — omit to apply to the whole store catalog',
  })
  categoryId?: Id;
}

export class RemoveStoreDiscountDTO {
  // Omit to clear the whole store catalog's discounts. Set to clear only one category.
  @Optional()
  @ValidateNumber({ allowNegative: false })
  @ApiProperty({
    required: false,
    description:
      'Limit the clear to one category — omit to clear the whole store catalog',
  })
  categoryId?: Id;
}

export class StoreZonePriceEntryDTO {
  @Required()
  @ValidateNumber()
  zoneId: Id;

  @Required()
  @ValidateNumber({ allowNegative: false })
  price: number;
}

export class SetStoreZonePricesDTO {
  @Required()
  @ValidateNested({ each: true })
  @Type(() => StoreZonePriceEntryDTO)
  @ApiProperty({ type: [StoreZonePriceEntryDTO] })
  zonePrices: StoreZonePriceEntryDTO[];
}
