import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Cross-field guard: the decorated numeric value must be strictly LESS THAN the
 * value of a sibling field (e.g. `priceAfterDiscount < price`). Null/undefined
 * pass — clearing or omitting the discount is always allowed; the presence check
 * belongs to `@Required`/`@Optional`. The sibling is read live off the validated
 * object so it works on both create (sibling present) and update DTOs.
 */
@ValidatorConstraint({ name: 'lessThanField' })
export class LessThanFieldConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments): boolean {
    if (value === null || value === undefined) return true;
    const [siblingField] = args.constraints as [string];
    const siblingValue = (args.object as Record<string, any>)[siblingField];
    // No sibling to compare against (e.g. price omitted on a partial update) =>
    // nothing to enforce here; the sibling's own validator handles its presence.
    if (siblingValue === null || siblingValue === undefined) return true;
    return Number(value) < Number(siblingValue);
  }

  defaultMessage(args: ValidationArguments): string {
    const [siblingField] = args.constraints as [string];
    return `${args.property} must be less than ${siblingField}`;
  }
}

export function LessThanField(
  siblingField: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [siblingField],
      validator: LessThanFieldConstraint,
    });
  };
}
