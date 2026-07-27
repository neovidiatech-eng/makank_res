import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDate } from 'class-validator';

export function ValidateDate(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({ type: Date, example: new Date(), ...apiPropertyOptions }),
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
      return new Date(value);
    }),
    IsDate(),
  );
}
