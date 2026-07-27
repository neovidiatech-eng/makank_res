import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { ClassConstructor, plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { globalValidationPipeOptions } from 'src/configs/pipes.config';

export const Filter = createParamDecorator(
  async (
    _: { key?: string; dto?: ClassConstructor<object> },
    ctx: ExecutionContext,
  ) => {
    const request = ctx.switchToHttp().getRequest();
    const body = request.body || {};
    const query = request.query || {};
    const params = request.params || {};

    const merged = {};

    // Helper function to parse JSON strings
    const parseJsonValue = (value: any): any => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (_) {
          // If parsing fails, return the original value
          return value;
        }
      }
      return value;
    };

    // Helper function to process object and parse JSON strings
    const processObject = (obj: object): object => {
      const processed = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          processed[key] = parseJsonValue(obj[key]);
        }
      }
      return processed;
    };

    const mergeValues = (source: object, target: object) => {
      // Process source object to parse JSON strings
      const processedSource = processObject(source);

      for (const key in processedSource) {
        if (Object.prototype.hasOwnProperty.call(processedSource, key)) {
          if (!Array.isArray(target[key]))
            target[key] = target[key] ? [target[key]] : [];

          if (Array.isArray(processedSource[key])) {
            if (Array.isArray(target[key])) {
              target[key] = [
                ...new Set([...target[key], ...processedSource[key]]),
              ];
            } else if (target[key] !== undefined) {
              target[key] = [
                ...new Set([target[key], ...processedSource[key]]),
              ];
            } else {
              target[key] = [...processedSource[key]];
            }
          } else {
            if (Array.isArray(target[key])) {
              target[key] = [
                ...new Set([...target[key], processedSource[key]]),
              ];
            } else if (target[key] !== undefined) {
              target[key] = [...new Set([target[key], processedSource[key]])];
            } else {
              target[key] = processedSource[key];
            }
          }
        }
      }
    };

    mergeValues(query, merged);
    mergeValues(body, merged);
    mergeValues(params, merged);

    if (_.dto) {
      const transformed = plainToClass(_.dto, merged);

      const errors = await validate(transformed, globalValidationPipeOptions);

      if (errors.length > 0) {
        const errorMessage = errors
          .map((error) => Object.values(error.constraints || {}))
          .flat()
          .join(', ');

        throw new BadRequestException(errorMessage);
      }
      return transformed;
    }

    if (_.key) return merged[_.key];
    return merged;
  },
);
