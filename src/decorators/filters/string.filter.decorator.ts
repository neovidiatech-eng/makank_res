import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export function StringArrayFilter<Type>(example: Type[]) {
  return applyDecorators(
    ApiProperty({ example }),
    IsOptional(),
    Transform(({ value }) => {
      if (Array.isArray(value)) return value;
      return [value];
    }),
    IsNotEmpty({ each: true }),
    IsString({ each: true }),
  );
}
