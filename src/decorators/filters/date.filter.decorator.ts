import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export function DateArrayFilter<Type>(example: Type[]) {
  return applyDecorators(
    ApiProperty({ example }),
    IsOptional(),
    Transform(({ value }) => {
      if (Array.isArray(value)) return value;
      return value.map((date: string | Date) => new Date(date));
    }),
    IsDate({ each: true }),
  );
}
