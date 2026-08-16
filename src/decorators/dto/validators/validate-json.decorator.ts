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
    Transform(({ value }) => {
      if (!value && value !== 0) return undefined;
      let val;
      if (typeof value === 'object') {
        val = value;
      } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            val = parsed;
          } else {
            val = { ar: trimmed, en: trimmed };
          }
        } catch (_) {
          val = { ar: trimmed, en: trimmed };
        }
      }

      if (val && typeof val === 'object') {
        if (val.ar && !val.en) val.en = val.ar;
        if (val.en && !val.ar) val.ar = val.en;
      }

      return val;
    }),
  );
}
