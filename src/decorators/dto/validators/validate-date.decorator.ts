import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate } from 'class-validator';

export function ValidateDate(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({ type: Date, example: new Date(), ...apiPropertyOptions }),
    Type(() => Date),
    Transform(({ value }) => {
      // Absent / empty multipart input => leave undefined so `@IsOptional()`
      // skips it. `new Date('')`/`new Date(undefined)` is an Invalid Date,
      // which would otherwise fail `@IsDate()` even when the field is optional.
      if (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '')
      ) {
        return undefined;
      }
      return value instanceof Date ? value : new Date(value);
    }),
    IsDate(),
  );
}
