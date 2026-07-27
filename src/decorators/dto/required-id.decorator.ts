import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export function IsRequiredId(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty(apiPropertyOptions),
    IsString(),
    IsNotEmpty(),
  );
}
