import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  OrderCategory,
  OrderStatus,
  OrderType,
  PaymentMethod,
  TransferType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { OptionalFile } from 'src/_modules/media/decorators/upload.decorator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { SortProp } from 'src/decorators/dto/sort-prop.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateDate } from 'src/decorators/dto/validators/validate-date.decorator';
import {
  ValidateNumber,
  ValidateNumberArray,
} from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { PaginationParamsDTO } from 'src/dtos/params/pagination-params.dto';
export class OrderItemDTO {
  @Required()
  @ValidateNumber()
  serviceId: Id;

  @Optional()
  @ValidateNumber()
  sizeId: Id;

  @Optional()
  @ValidateNumberArray({ allowNegative: false })
  addonIds: Id[];

  @Required()
  @ValidateNumber({ allowNegative: false })
  quantity: number;
}

export class BundleLineDTO {
  @Required()
  @ValidateNumber()
  serviceId: Id;

  @Optional()
  @ValidateNumber()
  sizeId?: Id;

  @Optional()
  @ValidateNumberArray({ allowNegative: false })
  addonIds?: Id[];

  @Optional()
  @ValidateNumber({ allowNegative: false })
  quantity?: number;
}

export class BundleSelectionDTO {
  @Required()
  @ValidateNumber()
  bundleId: Id;

  @Required()
  @ValidateNested({ each: true })
  @Type(() => BundleLineDTO)
  @ApiProperty({ type: [BundleLineDTO] })
  paidItems: BundleLineDTO[];

  @Required()
  @ValidateNested({ each: true })
  @Type(() => BundleLineDTO)
  @ApiProperty({ type: [BundleLineDTO] })
  freeItems: BundleLineDTO[];
}

export class CalculateOrderDTO {
  @Optional()
  @ValidateString()
  couponCode?: string;

  @Optional()
  @ApiProperty({ type: [OrderItemDTO] })
  items?: OrderItemDTO[];

  @Optional()
  @ValidateNested({ each: true })
  @Type(() => BundleSelectionDTO)
  @ApiProperty({ type: [BundleSelectionDTO] })
  bundleSelections?: BundleSelectionDTO[];

  @OptionalSwagger()
  userId: Id;

  @Optional()
  @ValidateNumber()
  addressId?: Id;

  // The zone the customer picked from a dropdown. Product decision: takes
  // priority for PRICING over the address's real, auto-resolved zone whenever
  // it has a price set (HelpersService.getDeliveryPrice) — falls back to the
  // real address zone / km-formula only when the picked zone has no price.
  // addressId/lat-lng remain the source of truth for geofencing/delivery
  // coverage regardless; this field is never resolved into a location itself.
  @Optional()
  @ValidateNumber()
  @ApiProperty({
    example: 5,
    description:
      "Zone the customer picked from the dropdown — takes priority for pricing over the address's real zone when it has a price set (falls back to the real zone / km-formula otherwise)",
    required: false,
  })
  zoneId?: Id;

  @Required()
  @ValidateNumber()
  branchId: Id;

  @Optional()
  @ValidateNumber()
  tip?: number;

  @Optional()
  @ValidateEnum(OrderType)
  type?: OrderType;

  @Optional()
  @ValidateNumber()
  fortuneRewardId?: Id;
}
export class CreateOrderDTO extends CalculateOrderDTO {
  @Optional()
  @ValidateString()
  note?: string;

  @Required()
  @ValidateEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @Optional()
  @ValidateBoolean()
  paidWithWallet?: boolean;

  @Optional()
  @ValidateBoolean()
  isGift?: boolean;

  @Optional()
  @ValidateEnum(OrderCategory)
  category?: OrderCategory;

  @Optional()
  @ValidateDate()
  scheduledAt?: Date;

  @Optional()
  @ValidateString()
  transferNumber?: string;

  // Which WALLET-payment sub-method was used — genuinely optional. The
  // customer never has to pick a wallet provider; transferNumber (phone) +
  // transferImage are the only required proof regardless of provider. Only
  // an explicit BANK_TRANSFER switches the requirement to
  // transferAccountNumber instead (validated in OrderService, not here, so
  // the error message can explain exactly what's missing).
  @Optional()
  @ValidateEnum(TransferType)
  @ApiProperty({
    enum: TransferType,
    required: false,
    example: TransferType.VODAFONE_CASH,
  })
  transferType?: TransferType;

  @Optional()
  @ValidateString()
  @ApiProperty({
    required: false,
    example: 'EG380019000500000000263180002',
    description:
      'Bank account number/IBAN — required when transferType is BANK_TRANSFER',
  })
  transferAccountNumber?: string;

  @OptionalFile()
  transferImage?: string;
}
export class UpdateOrderDTO extends PartialType(CreateOrderDTO) {}
export class AssignOrderDTO {
  @Required()
  @ValidateNumber()
  specialistId: Id;

  @Required()
  @ValidateNumberArray({ allowNegative: false })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ApiProperty({ type: [Number], example: [11111, 22222, 33333] })
  orderIds: Id[];
}
export class BulkDeleteOrdersDTO {
  @Required()
  @ValidateNumberArray({ allowNegative: false })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ApiProperty({ type: [Number], example: [11111, 22222, 33333] })
  orderIds: Id[];
}
export class SortOrderDTO {
  @SortProp()
  @ApiProperty({ example: 'asc' })
  id?: SortOptions;
}
export class FilterOrderDTO extends PaginationParamsDTO {
  @Optional()
  @ValidateNumber()
  id?: Id;
  @Optional()
  @ValidateNumber()
  userId: Id;
  @Optional()
  orderBy?: SortOrderDTO[];
  @Optional()
  @ValidateEnum(OrderStatus)
  @Optional()
  @ValidateEnum(OrderType)
  type: OrderType;

  @Optional()
  @ValidateNumber()
  deliveryId?: Id;

  @Optional()
  @ValidateEnum(OrderStatus)
  status: OrderStatus;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  cityId?: Id;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  zoneId?: Id;

  @Optional()
  @ValidateNumber()
  branchId?: Id;

  @Optional()
  @ValidateNumber()
  storeId?: Id;

  @Optional()
  @ValidateNumber()
  lat?: number;

  @Optional()
  @ValidateNumber()
  lng?: number;

  @Optional()
  @ValidateBoolean()
  current?: boolean;

  @Optional()
  @ValidateBoolean()
  past?: boolean;

  @Optional()
  @ValidateEnum(OrderCategory)
  category?: OrderCategory;

  @Optional()
  t?: string;
}

export class ChangeOrderStatusParam extends RequiredIdParam {
  @Required()
  @ValidateEnum(OrderStatus)
  status: OrderStatus;
}

// Driver's current position, sent in the request body — :id/:status are route params,
// so lat/lng can never arrive as route params (there's no :lat/:lng segment).
export class ChangeOrderStatusBodyDTO {
  @Optional()
  @ValidateNumber()
  lat?: number;

  @Optional()
  @ValidateNumber()
  lng?: number;
}

export class VerifyOrderPaymentDTO {
  @Required()
  @ValidateBoolean()
  approved: boolean;

  @Optional()
  @ValidateString()
  reason?: string;
}

export class AdminNoteDTO {
  @Required()
  @ValidateString()
  adminNote: string;
}
