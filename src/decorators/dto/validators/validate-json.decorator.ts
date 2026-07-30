import { applyDecorators, BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsObject } from 'class-validator';

export function ValidateJson() {
  return applyDecorators(
    Transform(({ value, key }) => {
      let val;
      if (typeof value === 'object') return value;
      // multipart/form-data sends omitted optional fields as '' — let
      // @Optional()/IsDefined() handle absence instead of failing JSON.parse('').
      if (value === undefined || value === null || value === '')
        return undefined;

      try {
        val = JSON.parse(value);
      } catch (_) {
        throw new BadRequestException(`errors.invalidStringifiedJson ${key}`, {
          cause: { field: key },
        });
      }

      return val;
    }),
  );
}

export function ValidateName(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({
      ...apiPropertyOptions,
      example: apiPropertyOptions?.example || '{"en": "John", "ar": "جون"}',
    }),
    IsObject(),
    Transform(({ value, key }) => {
      let val;
      if (typeof value === 'object') {
        val = value;
      } else {
        try {
          val = JSON.parse(value);
        } catch (_) {
          throw new BadRequestException(`errors.invalidStringifiedJson ${key}`, {
            cause: { field: key },
          });
        }
      }

      // A client whose own UI is Arabic-only (or English-only) was found to
      // send just that one locale key — e.g. `{ar: "بيتزا"}` with no `en` at
      // all — leaving the other language blank everywhere this name/title/
      // description is displayed (customer app in the other locale, admin
      // dashboard, etc.), for every entity that uses this decorator
      // (products, categories, bundles, stores...). Mirroring one into the
      // missing slot means neither language ever renders empty; it's not a
      // real translation, but a duplicated value beats a blank field.
      if (val && typeof val === 'object') {
        if (val.ar && !val.en) val.en = val.ar;
        if (val.en && !val.ar) val.ar = val.en;
      }

      return val;
    }),
  );
}
