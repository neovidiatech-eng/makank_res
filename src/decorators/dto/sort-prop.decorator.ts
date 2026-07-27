import { BadRequestException, applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Allow, IsOptional } from 'class-validator';

export function SortProp() {
  return applyDecorators(
    Allow(),
    IsOptional(),
    Transform(({ value }) => {
      if (['asc', 'desc'].includes(value))
        throw new BadRequestException('Invalid sort value must be asc or desc');
      return value;
    }),
  );
}
