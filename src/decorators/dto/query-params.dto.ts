import { applyDecorators } from '@nestjs/common';
import { Allow, IsNotEmpty, IsOptional } from 'class-validator';

export function QueryParam() {
  return applyDecorators(Allow(), IsOptional(), IsNotEmpty());
}
