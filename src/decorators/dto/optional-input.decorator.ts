import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export function Optional(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    IsOptional(),
    ApiProperty({ ...apiPropertyOptions, required: false }),
  );
}
