import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: true })
@Injectable()
export class UniqueInDatabaseConstraint
  implements ValidatorConstraintInterface
{
  private prisma = new PrismaClient();

  async validate(value: any, args: ValidationArguments): Promise<boolean> {
    const model: string =
      args.constraints?.at(0) || args.property.slice(0, -2).toLowerCase();
    try {
      await this.prisma.$connect();
      const exist = await this.prisma[model].findUnique({
        where: {
          [args.property]: value,
          deletedAt: null,
          ...args.constraints?.at(1),
        },
      });
      return !exist;
    } catch (e) {
      throw e;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  defaultMessage(args: ValidationArguments) {
    return `*${args.property}* 0UNIQUE0`;
  }
}

import { registerDecorator, ValidationOptions } from 'class-validator';

export function ValidateUnique<
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
    extraConditions?: WhereInput;
    message?: string;
  },
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validation?.message
        ? { message: validation.message, ...validationOptions }
        : validationOptions,
      constraints: [validation?.model, validation?.extraConditions],
      validator: UniqueInDatabaseConstraint,
    });
  };
}
