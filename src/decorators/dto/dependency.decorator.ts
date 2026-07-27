import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'atLeastOneRequired', async: false })
class AtLeastOneRequiredConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const fieldNames = args.constraints as string[];
    const object = args.object as any;

    // If the current field (value) is present, validation passes
    if (value != null) return true;

    // Otherwise, check if any other field is present
    return fieldNames.some((fieldName) => object[fieldName] != null);
  }

  defaultMessage(args: ValidationArguments) {
    const fieldNames = args.constraints as string[];
    return `At least one of the following fields must be provided: ${fieldNames.join(' or ')}`;
  }
}

export function AtLeastOneRequired(
  fields: string[],
  validationOptions?: ValidationOptions,
) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'atLeastOneRequired',
      target: object.constructor,
      propertyName: propertyName,
      constraints: fields,
      options: validationOptions,
      validator: AtLeastOneRequiredConstraint,
    });
  };
}

// import { IsOptional, IsString, IsEmail } from 'class-validator';
// import { AtLeastOneRequired } from './at-least-one-required.decorator';

// export class CreateProductNotificationDTO {
//   @IsOptional()
//   @IsString()
//   @AtLeastOneRequired(['userId', 'email'])
//   userId?: string;

//   @IsOptional()
//   @IsEmail()
//   email?: string;
// }
