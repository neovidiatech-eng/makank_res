import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

export function NumberArrayFilter<Type>(example: Type[]) {
  return applyDecorators(
    ApiProperty({ example }),
    IsOptional(),
    Transform(({ value }) => {
      if (Array.isArray(value))
        return value.map((element: string | number) => +element);
      return [+value];
    }),
    IsNumber({}, { each: true }),
  );
}
