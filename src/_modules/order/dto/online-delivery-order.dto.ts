import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  ValidateNested,
} from 'class-validator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';

// One recipient/dropoff within a batched online-delivery order — the "طلب"
// the seller adds via "+ إضافة طلب". Becomes one DROPOFF OrderStation.
export class OnlineDeliveryRecipientDTO {
  @Required()
  @ValidateString()
  @ApiProperty({ example: 'أحمد علي' })
  recipientName: string;

  @Required()
  @ValidateString()
  @ApiProperty({ example: '01098765432' })
  recipientPhone: string;

  @Required()
  @ValidateNumber()
  @ApiProperty({
    example: 5,
    description: 'Delivery zone id (from GET /zones)',
  })
  deliveryZoneId: Id;

  @Required()
  @ValidateString()
  @ApiProperty({
    example: 'شارع النصر، عمارة 12، الدور 3، شقة 5',
    description: 'Street/building/floor/apartment',
  })
  addressDetails: string;

  // Optional real map pin for this recipient. The zone dropdown remains the
  // mandatory way to place a recipient; this only matters for the FIRST
  // recipient's delivery fee — when both this and the sender's pickupLat/
  // pickupLng are given, that leg is priced by actual distance instead of the
  // flat base fee. Falls back to the zone centroid when omitted.
  @Optional()
  @ValidateNumber()
  @ApiProperty({
    example: 24.7136,
    required: false,
    description:
      "Recipient's real location — optional, only needed for a precise map pin / distance-based pricing.",
  })
  lat?: number;

  @Optional()
  @ValidateNumber()
  @ApiProperty({
    example: 46.6753,
    required: false,
    description:
      "Recipient's real location — optional, only needed for a precise map pin / distance-based pricing.",
  })
  lng?: number;

  @Optional()
  @ValidateString()
  @ApiProperty({
    example: 'فستان مقاس M',
    required: false,
    description: 'Order description for this recipient',
  })
  itemsDescription?: string;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  @ApiProperty({ required: false, description: 'قيمة الطلب (اختياري)' })
  estimatedCost?: number;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  @ApiProperty({
    required: false,
    description:
      'قيمة التحصيل (اختياري) — cash the driver should collect from this recipient. Recorded as data only for now; not yet wired into any wallet/settlement logic.',
  })
  collectionAmount?: number;

  @Optional()
  @ValidateBoolean()
  @ApiProperty({
    example: false,
    required: false,
    description: 'Packaging add-on for this recipient specifically',
  })
  packagingRequested?: boolean;

  @Optional()
  @ValidateString()
  @ApiProperty({
    example: 'برجاء الاتصال قبل الوصول',
    required: false,
    description: 'Notes specific to this recipient/order',
  })
  notes?: string;

  // Aliases for compatibility with the mobile client
  @Optional()
  @ValidateString()
  @ApiProperty({ required: false, description: 'Alias for itemsDescription' })
  orderDescription?: string;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  @ApiProperty({ required: false, description: 'Alias for estimatedCost' })
  orderValue?: number;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  @ApiProperty({ required: false, description: 'Alias for collectionAmount' })
  cashCollection?: number;

  @Optional()
  @ValidateBoolean()
  @ApiProperty({ required: false, description: 'Alias for packagingRequested' })
  packaging?: boolean;

  // Ids returned by POST /orders/custom-delivery/images. They must belong to the
  // requesting user and be still unused — validated/consumed at order creation
  // (same upload endpoint and consumption logic as Purchase/Restaurant stops).
  @Optional()
  @IsArray()
  @ArrayMaxSize(5, { message: 'لا يمكن إرفاق أكثر من 5 صور لكل طلب' })
  @IsInt({ each: true })
  @Type(() => Number)
  @ApiProperty({
    type: [Number],
    required: false,
    example: [12, 13],
    description:
      'Image ids returned by POST /orders/custom-delivery/images (this user, unused) — photos of the products for this recipient',
  })
  imageIds?: number[];
}


// Online-seller delivery: one fixed sender/pickup point + a batch of recipients
// (each a separate dropoff) — a system fully separate from the
// purchase/shopping custom-delivery flow (DeliveryStopDTO), per product
// decision. Zone dropdowns are the mandatory way to place the sender and every
// recipient; a real map pin (pickupLat/pickupLng, and each recipient's
// lat/lng) is optional on top of that — only used to price the first leg by
// actual distance instead of the flat base fee (see priceOnlineRecipients).
// Sender fields are optional here because a returning "online seller" may
// omit them and rely on their saved OnlineSellerProfile instead (see
// OrderService.resolveOnlineSender).
export class OnlineDeliveryOrderDTO {
  @Optional()
  @ValidateBoolean()
  @ApiProperty({
    example: true,
    required: false,
    description:
      "Save/refresh this user's seller profile (name/phone/pickup zone) for auto-fill on future orders",
  })
  isOnlineSeller?: boolean;

  @Optional()
  @ValidateString()
  @ApiProperty({
    example: 'متجر ندى',
    required: false,
    description:
      'Sender/seller name — required on first order unless a saved seller profile already has it',
  })
  senderName?: string;

  @Optional()
  @ValidateString()
  @ApiProperty({ example: '01012345678', required: false })
  senderPhone?: string;

  @Optional()
  @ValidateNumber()
  @ApiProperty({
    example: 3,
    required: false,
    description: 'Pickup zone id (from GET /zones)',
  })
  pickupZoneId?: Id;

  // Optional real map pin for the sender/pickup point. Only affects pricing
  // when the first recipient ALSO drops a real pin (see
  // OnlineDeliveryRecipientDTO.lat/lng) — otherwise the flat base fee applies,
  // same as if neither were given.
  @Optional()
  @ValidateNumber()
  @ApiProperty({
    example: 24.7136,
    required: false,
    description:
      "Sender's real pickup location — optional, only needed for a precise map pin / distance-based pricing.",
  })
  pickupLat?: number;

  @Optional()
  @ValidateNumber()
  @ApiProperty({
    example: 46.6753,
    required: false,
    description:
      "Sender's real pickup location — optional, only needed for a precise map pin / distance-based pricing.",
  })
  pickupLng?: number;

  // One order per recipient — the "+ إضافة طلب" batch. All recipients are
  // picked up together from the same sender in one driver visit (multiple
  // DROPOFF stations after a single PICKUP), and the whole batch is priced,
  // paid, and confirmed as ONE order.
  @Required()
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب إضافة طلب واحد على الأقل' })
  @ValidateNested({ each: true })
  @Type(() => OnlineDeliveryRecipientDTO)
  @ApiProperty({ type: [OnlineDeliveryRecipientDTO] })
  recipients: OnlineDeliveryRecipientDTO[];

  @Optional()
  @ValidateString()
  @ApiProperty({
    example: 'برجاء الاتصال قبل الوصول',
    required: false,
    description: 'Notes for the whole order (sender/pickup level)',
  })
  note?: string;

  @Optional()
  @ValidateNumber()
  @ApiProperty({ required: false })
  tip?: number;

  @OptionalSwagger()
  userId?: Id;
}

export class CalculateOnlineDeliveryOrderDTO extends OnlineDeliveryOrderDTO {}

export class CreateOnlineDeliveryOrderDTO extends OnlineDeliveryOrderDTO {
  @Required()
  @ValidateEnum(PaymentMethod)
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @Optional()
  @ValidateBoolean()
  @ApiProperty({ example: false, required: false })
  paidWithWallet?: boolean;
}
