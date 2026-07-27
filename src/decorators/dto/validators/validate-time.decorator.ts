import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export function ValidateTime(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({
      ...apiPropertyOptions,
      example: apiPropertyOptions?.example || '14:30',
    }),
    IsString(),
    Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
      message: 'Enter a valid time in 24-hour format (HH:MM)',
    }),
  );
}
