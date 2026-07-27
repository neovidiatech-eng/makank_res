import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsDefined, IsNotEmptyObject } from 'class-validator';
import { Nested } from '../nested.decorator';
import { ValidateJson } from './validate-json.decorator';

export function ValidateObject(type: any, isArray = false) {
  return applyDecorators(
    IsDefined(),
    isArray ? IsArray() : IsNotEmptyObject(),
    ValidateJson(),
    Type(() => type),
    Nested(type),
  );
}
