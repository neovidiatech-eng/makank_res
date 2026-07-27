import { BadRequestException } from '@nestjs/common';
import { DataType } from '@prisma/client';
import {
  isBoolean,
  isDate,
  isEnum,
  isLatitude,
  isLongitude,
  isNumber,
  isString,
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { generateEnumFromArray } from 'src/decorators/dto/enum.decorator';
import { toBoolean } from 'src/globals/helpers/boolean.helper';
import { settingTypes } from '../settings';

@ValidatorConstraint({ name: 'dynamicSettingValidator', async: false })
export class DynamicSettingValidator implements ValidatorConstraintInterface {
  validate(value: any, args: any): boolean {
    const settingConfig = settingTypes.find(
      (s) => s.setting === args?.object?.setting,
    ) as any;

    if (!settingConfig) return false;
    const cause = {
      field: args?.object?.setting,
      value,
      allowedValues: settingConfig?.enum,
    };
    switch (settingConfig.type) {
      case DataType.STRING:
        if (!isString(value))
          throw new BadRequestException('invalidString', { cause });
        return true;
      case DataType.TEXTAREA:
        if (!isString(value))
          throw new BadRequestException('InValidTextArea', { cause });
        return true;
      case DataType.NUMBER:
        if (!isNumber(+value))
          throw new BadRequestException('InValidNumber', { cause });
        return true;

      case DataType.BOOLEAN:
        value = toBoolean(value);
        if (!isBoolean(value))
          throw new BadRequestException('invalidBoolean', { cause });
        return true;

      case DataType.DATE:
      case DataType.DATETIME:
      case DataType.TIME:
        if (!isDate(value))
          throw new BadRequestException('invalidDate', { cause });
        return true;

      case DataType.ENUM:
        if (!settingConfig.enum) return true;
        if (Array.isArray(settingConfig.enum))
          settingConfig.enum = generateEnumFromArray(settingConfig.enum);
        if (!isEnum(value, settingConfig.enum))
          throw new BadRequestException('invalidEnum', { cause });
        return true;

      case DataType.LATITUDE:
        if (!isLatitude(value))
          throw new BadRequestException('invalidLatitude', { cause });
        return true;

      case DataType.LONGITUDE:
        if (!isLongitude(value))
          throw new BadRequestException('invalidLongitude', {
            cause,
          });
        return true;

      case DataType.JSON:
        try {
          value = JSON.parse(value);
          return true;
        } catch {
          throw new BadRequestException('invalidJson', { cause });
        }

      default:
        return true;
    }
  }

  defaultMessage(args: any) {
    const settingConfig = args.object?.settingConfig;
    throw new BadRequestException(
      `Invalid value for setting type ${settingConfig?.type}, ${settingConfig?.setting}, ${args?.object?.setting}`,
      { cause: { field: args?.object?.setting, type: settingConfig?.type } },
    );
    return 'done';
  }
}

export function ValidateSetting(validationOptions?: ValidationOptions) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: DynamicSettingValidator,
    });
  };
}
