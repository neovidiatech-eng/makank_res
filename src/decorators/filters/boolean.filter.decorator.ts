import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';
import { toBoolean } from 'src/globals/helpers/boolean.helper';

export function BooleanArrayFilter<Type>(example: Type[]) {
  return applyDecorators(
    ApiProperty({ example }),
    IsOptional(),
    Transform(({ value }) => {
      if (value === undefined || value === null || value === '') return undefined;
      if (Array.isArray(value)) return value.map((item) => toBoolean(item));
      return [toBoolean(value)];
    }),
    IsNotEmpty({ each: true }),
    IsBoolean({ each: true }),
  );
}
