import { applyDecorators } from '@nestjs/common';
import { IsOptional } from 'class-validator';

export function OptionalSwagger() {
  return applyDecorators(IsOptional());
}
