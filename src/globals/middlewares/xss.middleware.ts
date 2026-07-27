import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { filterXSS } from 'xss';

@Injectable()
export class XssMiddleware implements NestMiddleware {
  private sanitizeObject<T>(dataToSanitize: T): T {
    if (typeof dataToSanitize === 'string') {
      const data = filterXSS(dataToSanitize) as T;
      return data;
    } else if (Array.isArray(dataToSanitize)) {
      return dataToSanitize.map((item: T) => this.sanitizeObject(item)) as T;
    } else if (dataToSanitize && typeof dataToSanitize === 'object') {
      const sanitizedObj = {} as { [K in keyof T]: T[K] };
      for (const key in dataToSanitize) {
        if (Object.prototype.hasOwnProperty.call(dataToSanitize, key)) {
          sanitizedObj[key] = this.sanitizeObject(dataToSanitize[key]);
        }
      }
      return sanitizedObj;
    }
    return dataToSanitize;
  }

  use(req: Request, _res: Response, next: NextFunction) {
    req.body = this.sanitizeObject(req.body);
    req.query = this.sanitizeObject(req.query);
    req.params = this.sanitizeObject(req.params);

    next();
  }
}
