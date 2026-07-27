import { applyDecorators, BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';

export function ValidateString() {
  return applyDecorators(
    Transform(({ value }) => {
      if (Array.isArray(value)) {
        value = value.map(String);
        return value.length > 0 ? value[0] : undefined;
      } else {
        if (typeof value === 'string') return value;
      }
    }),
    // IsString({ message: 'Must be a non-empty string' }),
  );
}

export function ValidateStringArray() {
  return applyDecorators(
    Transform(({ value }) => {
      if (Array.isArray(value)) value = value.map(String);
      if (typeof value === 'string') value = value.split(',').map(String);
      value = value?.map((value) => value !== '' && value.trim());
      if (value.length > 0) return value;
      return undefined;
    }),
    IsString({
      each: true,
      message: (property) => {
        throw new BadRequestException(`validator.invalidStringArray`, {
          cause: { field: property },
        });
      },
    }),
  );
}
