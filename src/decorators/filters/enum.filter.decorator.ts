import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export function EnumArrayFilter(
  Enum: object,
  name: string,
  description: string,
) {
  return applyDecorators(
    ApiProperty({
      enum: Enum,
      enumName: name,
      description,
    }),
    IsEnum(Enum, { each: true }),
  );
}
