import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate } from 'class-validator';

export function ValidateDate(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({ type: Date, example: new Date(), ...apiPropertyOptions }),
    Transform(({ value }) => {
      // Absent / empty query parameter => leave undefined so `@Optional()` skips it.
      if (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '')
      ) {
        return undefined;
      }
      if (value instanceof Date) {
        return isNaN(value.getTime()) ? undefined : value;
      }
      const parsed = new Date(value);
      // If parsing failed, return original value so `@IsDate()` will report a validation error.
      return isNaN(parsed.getTime()) ? value : parsed;
    }),
    IsDate(),
  );
}
