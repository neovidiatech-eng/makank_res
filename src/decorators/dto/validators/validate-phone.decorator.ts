import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export function ValidatePhone(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({
      ...apiPropertyOptions,
      example: apiPropertyOptions?.example || '+201092725145',
    }),
    IsString(),
    Matches(/^\+20(0?1[0-25])[0-9]{8}$/, {
      message:
        'enter valid Egyptian phone like this +201092725145 or +2001092725145',
    }),
  );
}
