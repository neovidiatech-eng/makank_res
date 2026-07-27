import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsEmailOrPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: any) {
    const phoneRegex = /^\+\d{1,3}\s\d{8,10}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return (
      typeof value === 'string' &&
      (phoneRegex.test(value) || emailRegex.test(value))
    );
  }

  defaultMessage() {
    return 'The value must be a valid email address or phone number';
  }
}

export function IsEmailOrPhone(validationOptions?: ValidationOptions) {
  return function (object: unknown, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsEmailOrPhoneConstraint,
    });
  } as PropertyDecorator;
}

export function ValidateEmailOrPhone(apiPropertyOptions?: ApiPropertyOptions) {
  return applyDecorators(
    ApiProperty({
      ...apiPropertyOptions,
      example:
        apiPropertyOptions?.example || 'example@mail.com or +999 999999999',
    }),
    IsEmailOrPhone({
      message: 'The value must be a valid email address or phone number',
    }),
  );
}
