import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional } from 'class-validator';

export function ValidateFile(options?: ApiPropertyOptions) {
  if (options) options.required = Boolean(options?.required) ?? false;
  return applyDecorators(
    ApiProperty({
      ...options,
      type: String,
      format: 'binary',
    }),
    options?.required ? IsOptional() : IsNotEmpty(),
  );
}
