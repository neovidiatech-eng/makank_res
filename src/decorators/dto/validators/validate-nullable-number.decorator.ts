import { applyDecorators, BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber, ValidateIf } from 'class-validator';

/**
 * Nullable, clearable numeric field. Unlike `@ValidateNumber` (which collapses
 * blank input to `undefined` — a Prisma no-op that can never CLEAR a column),
 * this decorator distinguishes three states so a PATCH can both set and reset:
 *
 *   - key ABSENT from the payload        => `undefined` (Prisma leaves column as-is)
 *   - key PRESENT but empty (''/null)    => `null`      (Prisma clears the column)
 *   - key present with a value           => coerced number (same `allowNegative:false`
 *                                           guard as `@ValidateNumber`)
 *
 * `key in obj` is the only reliable way to tell "absent" from "present-empty",
 * since both surface as a falsy `value`. Negatives are rejected eagerly, matching
 * `@ValidateNumber`. The trailing `@ValidateIf` skips `@IsNumber` for `null`/
 * `undefined` so clearing/omitting stays valid.
 */
export function ValidateNullableNumber(
  options: { allowNegative?: boolean } = { allowNegative: false },
) {
  return applyDecorators(
    Transform(({ value, key, obj }) => {
      // Absent key => no-op for Prisma.
      if (!(key in obj)) return undefined;
      // Present-but-empty => explicit clear.
      const isEmpty =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '');
      if (isEmpty) return null;
      const num = +value;
      if (options.allowNegative === false && num < 0) {
        throw new BadRequestException('Negative numbers are not allowed');
      }
      return num;
    }),
    ValidateIf((_, value) => typeof value === 'number'),
    IsNumber(),
  );
}
