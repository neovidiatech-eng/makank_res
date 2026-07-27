import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { findModelsWithNameAndStringOrJsonFields } from '../helpers/findModelsWithName.helper';

export function ValidateModelAndField(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    const VALID_MODELS = findModelsWithNameAndStringOrJsonFields();
    registerDecorator({
      name: 'ValidateModelAndField',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          const obj = args.object as any;
          const model = obj.model;
          const fields = obj.fields;

          const matchedModel = VALID_MODELS.find((m) => m.model === model);
          if (!matchedModel) return false;
          const matchedField = fields?.every((field) =>
            matchedModel.fields.some((f) => f.name === field),
          );
          return matchedField;
        },
        defaultMessage(args: ValidationArguments) {
          const obj = args.object as any;
          return `"${obj.field}" is not a valid field of model "${obj.model}"`;
        },
      },
    });
  };
}
