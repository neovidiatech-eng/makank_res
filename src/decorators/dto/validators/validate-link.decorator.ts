import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export function ValidateLink(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({
      ...apiPropertyOptions,
      example: apiPropertyOptions?.example || 'https://domain.com',
    }),
    IsString(),
    Matches(
      /\bhttps?:\/\/(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/,
      {
        message: 'enter valid link like https://domain.com',
      },
    ),
  );
}
