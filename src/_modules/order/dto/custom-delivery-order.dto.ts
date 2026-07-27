import { ApiProperty } from '@nestjs/swagger';
import {
  CustomDeliveryKind,
  PaymentMethod,
  TransferType,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  ValidateNested,
} from 'class-validator';
import { OptionalFile } from 'src/_modules/media/decorators/upload.decorator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { OptionalSwagger } from 'src/decorators/dto/validators/optional-swagger.decorator';
import { ValidateBoolean } from 'src/decorators/dto/validators/validate-boolean.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';

export class DeliveryStopDTO {
  // Zone is now the mandatory way to place a stop — matches Online delivery's
  // zone-only model. lat/lng are optional: if omitted, the stop's coordinates
  // are resolved server-side to the zone's centroid (ZoneService.getZoneCentroid),
  // same fallback Online delivery already uses. If lat/lng ARE given, they're
  // still the real location used for geofencing/zone-coverage validation and
  // stored as the station's actual coordinates — zoneId then only affects
  // pricing priority (HelpersService.getCustomDeliveryPrice).
  @Required()
  @ValidateNumber()
  @ApiProperty({
    example: 5,
    description:
      "Zone this stop is in — mandatory. If lat/lng are omitted, the zone's centroid is used as the stop's location.",
  })
  zoneId: Id;

  @Optional()
  @ValidateNumber()
  @ApiProperty({
    example: 24.7136,
    description:
      'Location latitude — optional, only needed for a precise map pin. Falls back to the zone centroid when omitted.',
    required: false,
  })
  lat?: number;

  @Optional()
  @ValidateNumber()
  @ApiProperty({
    example: 46.6753,
    description:
      'Location longitude — optional, only needed for a precise map pin. Falls back to the zone centroid when omitted.',
    required: false,
  })
  lng?: number;

  @Optional()
  @ValidateString()
  @ApiProperty({
    example: 'الدار',
    description: 'Optional label for this stop',
    required: false,
  })
  label?: string;

  @Optional()
  @ValidateString()
  @ApiProperty({
    example: 'ورشة النور',
    description: 'Store / workshop / station name',
    required: false,
  })
  name?: string;

  @Optional()
  @ValidateString()
  @ApiProperty({
    example: 'كيلو موز + علبة عصير',
    description: 'What the driver should buy / do at this stop',
    required: false,
  })
  purchaseList?: string;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  @ApiProperty({
    example: 50,
    description: 'Estimated cost of items at this stop',
    required: false,
  })
  estimatedCost?: number;

  @Optional()
  @ValidateString()
  @ApiProperty({
    example: 'اطلب الصنف الكبير',
    description: 'Per-station instructions for the driver',
    required: false,
  })
  notes?: string;

  // Ids returned by POST /orders/custom-delivery/images. They must belong to the
  // requesting user and be still unused — validated/consumed at order creation.
  @Optional()
  @IsArray()
  @ArrayMaxSize(5, { message: 'لا يمكن إرفاق أكثر من 5 صور لكل محطة' })
  @IsInt({ each: true })
  @Type(() => Number)
  @ApiProperty({
    type: [Number],
    required: false,
    example: [12, 13],
    description:
      'Image ids returned by POST /orders/custom-delivery/images (this user, unused)',
  })
  imageIds?: number[];

  @Optional()
  @ValidateNumber()
  cityId?: number;
}

export class CalculateCustomDeliveryOrderDTO {
  @IsArray()
  @ArrayMinSize(2, { message: 'يجب إدخال مكانين على الأقل (بداية ونهاية)' })
  @ValidateNested({ each: true })
  @Type(() => DeliveryStopDTO)
  @ApiProperty({
    type: [DeliveryStopDTO],
    description:
      'قائمة المحطات بالترتيب — أول عنصر هو نقطة الانطلاق، آخر عنصر هو الوجهة، وما بينهم محطات وسطى اختيارية',
    minItems: 2,
    example: [
      { lat: 24.7136, lng: 46.6753, label: 'المستودع' },
      { lat: 24.74, lng: 46.69, label: 'العميل الأول' },
      { lat: 24.75, lng: 46.71, label: 'العميل الثاني' },
    ],
  })
  stops: DeliveryStopDTO[];

  @Optional()
  @ValidateNumber()
  tip?: number;

  @Optional()
  @ValidateString()
  itemsDescription?: string;

  @Optional()
  @ValidateNumber({ allowNegative: false })
  estimatedItemsCost?: number;

  @Optional()
  @ValidateNumber()
  @ApiProperty({
    required: false,
    example: '',
    description:
      'Fortune-wheel reward id. Only FREE_DELIVERY rewards are accepted for custom delivery.',
  })
  fortuneRewardId?: Id;

  @Optional()
  @ValidateString()
  @ApiProperty({
    example: 'تعليمات للسائق',
    description: 'Instructions for the driver',
    required: false,
  })
  driverInstructions?: string;

  @OptionalSwagger()
  userId?: Id;

  @Optional()
  @ValidateNumber()
  zoneId?: number;

  @Optional()
  @ValidateNumber()
  cityId?: number;
}

export class CreateCustomDeliveryOrderDTO extends CalculateCustomDeliveryOrderDTO {
  // Mechanically identical to PURCHASE (same stations/pricing/assignment) — this
  // only tells the driver/admin/frontend which labels to show ("محطة"/"مطعم",
  // "قائمة مشتريات"/"قائمة أوردر"). Defaults to PURCHASE. ONLINE is not accepted
  // here — it has its own separate endpoints.
  @Optional()
  @ValidateEnum([CustomDeliveryKind.PURCHASE, CustomDeliveryKind.RESTAURANT])
  @ApiProperty({
    enum: [CustomDeliveryKind.PURCHASE, CustomDeliveryKind.RESTAURANT],
    example: CustomDeliveryKind.PURCHASE,
    required: false,
    default: CustomDeliveryKind.PURCHASE,
  })
  kind?: CustomDeliveryKind;

  @Required()
  @ValidateEnum(PaymentMethod)
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @Optional()
  @ValidateBoolean()
  @ApiProperty({ example: false, required: false })
  paidWithWallet?: boolean;

  @Optional()
  @ValidateBoolean()
  @ApiProperty({ example: false, required: false })
  isGift?: boolean;

  @Optional()
  @ValidateString()
  @ApiProperty({ example: 'ملاحظات إضافية', required: false })
  note?: string;

  @Optional()
  @ValidateString()
  @ApiProperty({ example: '01092725145', required: false })
  transferNumber?: string;

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

// Multipart upload of one or more station images (field name `images`). Returns
// the created image ids, which the client then embeds per stop on order creation.
// `MapUploadsInterceptor` populates `images` as an array of saved file paths, each
// suffixed with INTERCEPTOR_KEY; we strip that marker per element here. (We do NOT
// use the shared ValidateImageArray — it calls String.replaceAll on the array and
// throws at runtime.)
export class UploadStationImagesDTO {
  @ApiProperty({ type: [String], format: 'binary', required: true })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    const key = env('INTERCEPTOR_KEY');
    return value
      .filter((v) => typeof v === 'string' && v.includes(key))
      .map((v) => v.replaceAll(key, '').trim())
      .filter((v) => v !== '');
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'يجب إرفاق صورة واحدة على الأقل' })
  @IsString({ each: true })
  images: string[];
}

// Body for the driver's "move to next location" / "finish task" actions.
// Coordinates are now mandatory — mirrors the geofence check regular
// (non-custom) delivery orders already enforce at pickup/delivery, applied
// here as "driver's point resolves to the same zone as the active station".
export class StationActionDTO {
  @Required()
  @ValidateNumber()
  @ApiProperty({ example: 24.7136 })
  lat: number;

  @Required()
  @ValidateNumber()
  @ApiProperty({ example: 46.6753 })
  lng: number;
}
