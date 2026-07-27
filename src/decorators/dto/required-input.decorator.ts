import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty } from 'class-validator';

export function Required(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(IsNotEmpty(), ApiProperty(apiPropertyOptions));
}

export function RequiredLocalized(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    IsNotEmpty(),
    ApiProperty({
      ...apiPropertyOptions,
      example: [{ lang: 'en', value: 'string' }],
    }),
  );
}

export function RequiredLocalizedMultiPart(
  apiPropertyOptions?: ApiPropertyOptions,
) {
  return applyDecorators(
    IsNotEmpty(), // Validates the localized field is not empty
    ApiProperty({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lang: { type: 'string', example: 'en' },
          value: { type: 'string', example: 'string' },
        },
      },
      required: true,
      example: [{ lang: 'en', value: 'string' }],
      ...apiPropertyOptions,
    }),
    Transform((value) => JSON.parse(value.value)),
  );
}
