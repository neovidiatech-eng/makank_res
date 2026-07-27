import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export function ValidateColor(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({
      ...apiPropertyOptions,
      example: apiPropertyOptions?.example || '#FFFFFF',
    }),
    IsString(),
    Matches(/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
      message: 'enter valid color like this #FFFFFF or #FFF',
    }),
  );
}
