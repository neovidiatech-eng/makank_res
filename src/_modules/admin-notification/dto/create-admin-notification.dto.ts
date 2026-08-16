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

const transformOptionalInt = ({ value }: { value: any }) => {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    value === 'null' ||
    value === 'undefined'
  ) {
    return undefined;
  }
  const num = Number(value);
  return isNaN(num) ? undefined : num;
};

export class CreateAdminNotificationDto {
  @ValidateName({ example: { ar: 'عنوان التنبيه', en: 'Notification Title' } })
  title: { ar: string; en: string };

  @ValidateName({ example: { ar: 'محتوى التنبيه', en: 'Notification Body' } })
  body: { ar: string; en: string };

  @ApiProperty({ enum: TargetType, example: TargetType.ALL })
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.toUpperCase() as TargetType) : value,
  )
  @IsEnum(TargetType)
  targetType: TargetType;

  @ApiProperty({
    example: [1, 2, 3],
    required: false,
    description:
      'List of user IDs. If targetType is STORE, these should be storeIds.',
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return undefined;
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(Number).filter((n) => !isNaN(n));
      } catch {
        return trimmed
          .split(',')
          .map((v) => Number(v.trim()))
          .filter((n) => !isNaN(n));
      }
    }
    if (Array.isArray(value)) return value.map(Number).filter((n) => !isNaN(n));
    if (typeof value === 'number') return [value];
    return value;
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  targetUserIds?: number[];

  // `@Type(() => Number)` below matters: this endpoint now accepts multipart
  // (image upload), where every field arrives as a string — without it, these
  // numeric fields fail @IsInt whenever an image is attached.
  @ApiProperty({
    example: 1,
    required: false,
    description: 'Store ID to open when the notification is clicked',
  })
  @Transform(transformOptionalInt)
  @IsInt()
  @IsOptional()
  storeId?: number;

  @ApiProperty({
    enum: NotificationTargetType,
    required: false,
    description:
      'Click destination when the notification is tapped. Separate from targetType (audience).',
  })
  @Transform(({ value }) => {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      value === 'null' ||
      value === 'undefined'
    ) {
      return undefined;
    }
    if (typeof value === 'string') {
      const upper = value.trim().toUpperCase();
      if (!upper || upper === 'NONE' || upper === 'NULL' || upper === 'UNDEFINED') {
        return undefined;
      }
      if (Object.values(NotificationTargetType).includes(upper as NotificationTargetType)) {
        return upper as NotificationTargetType;
      }
      return undefined;
    }
    return value;
  })
  @IsEnum(NotificationTargetType)
  @IsOptional()
  clickTargetType?: NotificationTargetType;

  @ApiProperty({ required: false })
  @Transform(transformOptionalInt)
  @IsInt()
  @IsOptional()
  clickStoreId?: number;

  @ApiProperty({ required: false })
  @Transform(transformOptionalInt)
  @IsInt()
  @IsOptional()
  clickCategoryId?: number;

  @ApiProperty({ required: false })
  @Transform(transformOptionalInt)
  @IsInt()
  @IsOptional()
  clickServiceId?: number;

  @ApiProperty({ required: false })
  @Transform(transformOptionalInt)
  @IsInt()
  @IsOptional()
  clickZoneId?: number;

  @ApiProperty({ required: false })
  @Transform(transformOptionalInt)
  @IsInt()
  @IsOptional()
  clickOrderId?: number;

  @ApiProperty({ required: false })
  @Transform(transformOptionalInt)
  @IsInt()
  @IsOptional()
  clickCouponId?: number;

  @ApiProperty({
    required: false,
    description: 'Driver id or flow string ("RESTAURANT" | "PURCHASE" | "ONLINE") when clickTargetType is SPECIAL_DRIVER',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      value === 'null' ||
      value === 'undefined'
    ) {
      return undefined;
    }
    return String(value);
  })
  @IsString()
  clickDeliveryId?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }) => {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      value === 'null' ||
      value === 'undefined'
    ) {
      return undefined;
    }
    return String(value).trim() || undefined;
  })
  @IsString()
  @IsOptional()
  clickUrl?: string;

  // Uploaded via multipart ('image' field) — the interceptor populates this
  // with the resolved server path, same convention as Campaign's image field.
  @OptionalFile()
  image?: string;
}
