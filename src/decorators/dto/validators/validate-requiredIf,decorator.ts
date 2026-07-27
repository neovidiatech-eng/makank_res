import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'requiredIf', async: false })
class RequiredIfConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const [conditionFn] = args.constraints;
    const object = args.object as any;

    // Check if the condition is met based on the object
    const isRequired = conditionFn(object);

    // If condition is true, field must be present
    if (isRequired) {
      return value !== null && value !== undefined;
    }

    // If condition is false, field is optional
    return true;
  }

  defaultMessage(args: ValidationArguments) {
    const [, dependentField] = args.constraints;
    return `${args.property} is required when ${dependentField} meets the specified condition`;
  }
}

export function RequiredIf(
  conditionFn: (object: any) => boolean,
  dependentField: string,
  validationOptions?: ValidationOptions & { message?: string },
) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'requiredIf',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [conditionFn, dependentField],
      options: validationOptions,
      validator: RequiredIfConstraint,
    });
  };
}
