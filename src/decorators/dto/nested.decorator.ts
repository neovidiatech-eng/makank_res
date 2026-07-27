import { BadRequestException } from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
  validate,
} from 'class-validator';

/**
 * @decorator
 * @description A custom decorator to validate a validation-schema within a validation schema upload N levels
 * @param schema The validation Class
 */
export function Nested(
  schema: new () => any,
  validationOptions?: ValidationOptions,
) {
  return function (object: unknown, propertyName: string) {
    let errors: string[] = [];

    registerDecorator({
      name: 'Nested',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [],
      options: validationOptions,
      validator: {
        async validate(value: any) {
          // If the value is an array, validate each item in the array
          errors = [];

          if (Array.isArray(value)) {
            for (let i = 0; i < (<Array<any>>value).length; i++) {
              const validationErrors = await validate(
                plainToClass(schema, value[i]),
              );
              if (validationErrors.length > 0) {
                errors.push(
                  ...validationErrors.flatMap((error) =>
                    Object.values(error?.constraints || {}),
                  ),
                );
                return false; // If validation errors exist, return false
              }
            }
            return true; // Return true if no errors found
          } else {
            // If it's not an array, validate the single value
            const validationErrors = await validate(
              plainToClass(schema, value),
            );
            validationErrors?.forEach((error) => {
              throw new BadRequestException(
                Object.values(error.constraints)?.at(0),
              );
            });
            return validationErrors.length === 0; // Return true if no errors
          }
        },

        defaultMessage(_: ValidationArguments) {
          return errors.join(', ');
        },
      },
    });
  };
}
