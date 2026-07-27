import { applyDecorators } from '@nestjs/common';
import { ApiQuery, PartialType } from '@nestjs/swagger';

export function ApiFilter(type: any, matchType = false) {
  return applyDecorators(
    ApiQuery({ type: matchType ? type : PartialType(type) }),
  );
}
