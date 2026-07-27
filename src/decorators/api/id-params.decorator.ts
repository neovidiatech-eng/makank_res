import { applyDecorators } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';

export function ApiOptionalIdParam(name = 'id') {
  return applyDecorators(ApiParam({ name, type: Number, required: false }));
}

export function ApiRequiredIdParam(name = 'id') {
  return applyDecorators(ApiParam({ name, type: Number, required: true }));
}

export function ApiOptionalIdNumberParam(name = 'id') {
  return applyDecorators(ApiParam({ name, type: Number, required: false }));
}

export function ApiRequiredIdNumberParam(name = 'id') {
  return applyDecorators(ApiParam({ name, type: Number, required: true }));
}
