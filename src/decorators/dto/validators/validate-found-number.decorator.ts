import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  isArray,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: true })
@Injectable()
export class ExistsInDatabaseConstraint
  implements ValidatorConstraintInterface
{
  private prisma = new PrismaClient();

  async validate(value: any, args: ValidationArguments): Promise<boolean> {
    const model: string =
      args.constraints?.at(0) || args.property.slice(0, -2).toLowerCase();
    const validateArrayExistence = args.constraints?.at(2);
    const otherConditions = args.constraints?.at(1);
    if (isNaN(value)) {
      return true;
    }
    try {
      await this.prisma.$connect();
      if (validateArrayExistence) {
        const exist = await this.prisma[model].findMany({
          where: { id: { in: value }, deletedAt: null, ...otherConditions },
        });
        const existingIds = exist.map((record) => record.id);
        // Find non-existent values
        const nonExistentValues = value.filter(
          (id) => !existingIds.includes(id),
        );
        if (nonExistentValues.length)
          throw new BadRequestException(`*[${nonExistentValues}]* 0EXIST0`);
        return true;
      }
      const exist = await this.prisma[model].findUnique({
        where: {
          id: isArray(value) ? value?.at(0) : value,
          deletedAt: null,
          ...otherConditions,
        },
      });
      return !!exist;
    } catch (e) {
      throw e;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  defaultMessage(args: ValidationArguments) {
    // const model =
    //   args.constraints?.at(0) || args.property.slice(0, -2).toLowerCase();
    const value = args.value;

    return `0EXIST0 *${value}*`;
  }
}

import { registerDecorator, ValidationOptions } from 'class-validator';

export function ValidateExist<
  ModelName extends keyof PrismaClient,
  WhereInput = ModelName extends keyof PrismaClient
    ? PrismaClient[ModelName] extends {
        findFirst: (args: { where: infer W }) => any;
      }
      ? W
      : never
    : never,
>(
  validation?: {
    model?: ModelName;
    isArray?: boolean;
    extraConditions?: WhereInput;
  },
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [
        validation?.model,
        validation?.extraConditions,
        validation?.isArray,
      ],
      validator: ExistsInDatabaseConstraint,
    });
  };
}
