import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { IsString, IsStrongPassword } from 'class-validator';

export function ValidatePassword(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({
      ...apiPropertyOptions,
      example: apiPropertyOptions?.example || 'Default@123',
      description:
        apiPropertyOptions?.description ||
        'Password must be: 8+ characters, 1 uppercase, 1 lowercase, 1 number, 1 special character',
    }),
    IsString(),
    IsStrongPassword({
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    }),
  );
}

export function ValidateLoginPassword(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({
      ...apiPropertyOptions,
      example: apiPropertyOptions?.example || 'Default@123',
      description: apiPropertyOptions?.description || 'invalid credentials',
    }),
    IsString(),
  );
}
