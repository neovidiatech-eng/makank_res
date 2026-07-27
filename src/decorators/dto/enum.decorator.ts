import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';

export function generateEnumFromArray<T extends string>(
  values: T[],
): { [K in T]: K } {
  return values.reduce(
    (acc, value) => {
      acc[value] = value;
      return acc;
    },
    {} as { [K in T]: K },
  );
}

export function ValidateEnum(
  enumType: object,
  matchCase = false,
  isArray = false,
) {
  if (Array.isArray(enumType)) enumType = generateEnumFromArray(enumType);
  return applyDecorators(
    ApiProperty({ enum: enumType, isArray: isArray }),
    Transform(({ value }) => {
      if (Array.isArray(value)) value = value?.at(-1);
      if (matchCase) return value;
      return value.toUpperCase();
    }),
    IsEnum(enumType),
  );
}
