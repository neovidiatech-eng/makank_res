import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

function toBoolean(value: string | number | boolean): boolean | undefined {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (['true', '1'].includes(lower)) return true;
    if (['false', '0'].includes(lower)) return false;
  }

  if (typeof value === 'number') return value !== 0;

  return undefined;
}

export function ValidateBoolean() {
  return applyDecorators(
    ApiProperty({ type: Boolean, example: true }),
    Transform(({ value }) => {
      const raw = Array.isArray(value) ? value[0] : value;
      const transformed = toBoolean(raw);
      return transformed;
    }),
    IsBoolean(),
  );
}
