import { ApiProperty } from '@nestjs/swagger';
import { NotificationTargetType } from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsUrl, IsString } from 'class-validator';
import { OptionalFile } from 'src/_modules/media/decorators/upload.decorator';
import { ValidateName } from 'src/decorators/dto/validators/validate-json.decorator';

export enum TargetType {
  ALL = 'ALL',
  CUSTOMER = 'CUSTOMER',
  STORE = 'STORE',
  DELIVERY = 'DELIVERY',
  SELECTED_USERS = 'SELECTED_USERS',
}

export class CreateAdminNotificationDto {
  @ValidateName({ example: { ar: 'عنوان التنبيه', en: 'Notification Title' } })
  title: { ar: string; en: string };

  @ValidateName({ example: { ar: 'محتوى التنبيه', en: 'Notification Body' } })
  body: { ar: string; en: string };

  @ApiProperty({ enum: TargetType, example: TargetType.ALL })
  @IsEnum(TargetType)
  targetType: TargetType;

  @ApiProperty({
    example: [1, 2, 3],
    required: false,
    description:
      'List of user IDs. If targetType is STORE, these should be storeIds.',
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  @Type(() => Number)
  targetUserIds?: number[];

  // `@Type(() => Number)` below matters: this endpoint now accepts multipart
  // (image upload), where every field arrives as a string — without it, these
  // numeric fields fail @IsInt whenever an image is attached.
  @ApiProperty({
    example: 1,
    required: false,
    description: 'Store ID to open when the notification is clicked',
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  storeId?: number;

  @ApiProperty({
    enum: NotificationTargetType,
    required: false,
    description:
      'Click destination when the notification is tapped. Separate from targetType (audience).',
  })
  @IsEnum(NotificationTargetType)
  @IsOptional()
  clickTargetType?: NotificationTargetType;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  clickStoreId?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  clickCategoryId?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  clickServiceId?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  clickZoneId?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  clickOrderId?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  clickCouponId?: number;

  @ApiProperty({
    required: false,
    description: 'Driver id or flow string ("RESTAURANT" | "PURCHASE" | "ONLINE") when clickTargetType is SPECIAL_DRIVER',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return String(value);
  })
  @IsString()
  clickDeliveryId?: string;

  @ApiProperty({ required: false })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @IsOptional()
  clickUrl?: string;

  // Uploaded via multipart ('image' field) — the interceptor populates this
  // with the resolved server path, same convention as Campaign's image field.
  @OptionalFile()
  image?: string;
}
