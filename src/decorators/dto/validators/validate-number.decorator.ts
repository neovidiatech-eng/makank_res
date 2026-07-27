import { applyDecorators, BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber } from 'class-validator';

// Treat "missing-ish" multipart input as absent. Swagger/multipart sends
// omitted optional fields as empty strings (`storeId=`), and `+''` is 0 — which
// silently turns "no value" into a real id 0 and trips downstream existence
// checks. Normalising these to `undefined` lets `@IsOptional()` skip the field
// (and `@IsNotEmpty()` still reject it on required fields).
const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '');

export function ValidateNumber(
  options: { allowNegative?: boolean } = { allowNegative: false },
) {
  return applyDecorators(
    Transform(({ value }) => {
      if (isBlank(value)) return undefined;
      const num = +value;
      if (options.allowNegative === false && num < 0) {
        throw new BadRequestException('Negative numbers are not allowed');
      }
      return num;
    }),
    IsNumber(),
  );
}

export function ValidateNumberArray(
  options: { allowNegative?: boolean } = { allowNegative: false },
) {
  return applyDecorators(
    Transform(({ value, key }) => {
      // Absent / empty multipart input => no ids. Returning `undefined` lets
      // `@IsOptional()` skip validation instead of producing `[NaN]`/`[0]`.
      if (isBlank(value)) return undefined;

      let numbers: number[];

      if (Array.isArray(value)) {
        numbers = value.map(Number);
      } else if (typeof value === 'string') {
        // Drop empty segments so "1,," / trailing commas don't yield NaN.
        numbers = value
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part !== '')
          .map(Number);
      } else {
        throw new BadRequestException(`Invalid number array in ${key}`);
      }

      if (options.allowNegative === false && numbers.some((n) => n < 0)) {
        throw new BadRequestException(
          'Negative numbers are not allowed in array',
        );
      }

      return numbers;
    }),
    IsNumber({}, { each: true }),
  );
}
