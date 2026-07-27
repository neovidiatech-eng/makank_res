import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export function NotRequired(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({ ...apiPropertyOptions, required: false }),
    IsNotEmpty(),
  );
}
