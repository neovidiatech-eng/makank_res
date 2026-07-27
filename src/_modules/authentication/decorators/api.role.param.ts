import { applyDecorators } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';

export function RoleParam() {
  return applyDecorators(ApiParam({ name: 'role' }));
}
