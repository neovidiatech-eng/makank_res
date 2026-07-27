import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  mixin,
  NestInterceptor,
  Type,
} from '@nestjs/common';
import { Observable } from 'rxjs';

export function ParseJsonBody(fields: string[]): Type<NestInterceptor> {
  @Injectable()
  class ParseJsonBodyInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      const req = context.switchToHttp().getRequest();
      if (req.body) {
        // 1. Parse specified complex fields (like arrays/objects)
        for (const field of fields) {
          if (typeof req.body[field] === 'string') {
            try {
              req.body[field] = JSON.parse(req.body[field]);
            } catch {
              // Fail loudly, naming the offending field, instead of letting the
              // unparsed string fall through to a misleading downstream error
              // (e.g. ArrayMinSize on `stops`). `*field* 0KEY0` is the
              // ResponseService i18n convention — it interpolates `field` as
              // {property} into response.invalidJson (see response.service.ts).
              throw new BadRequestException(`*${field}* 0invalidJson0`);
            }
          }
        }
        // 2. Automatically parse numbers and booleans for all keys in request.body
        for (const key of Object.keys(req.body)) {
          const val = req.body[key];
          if (typeof val === 'string') {
            if (val === 'true') {
              req.body[key] = true;
            } else if (val === 'false') {
              req.body[key] = false;
            } else if (val === 'null') {
              req.body[key] = null;
            } else if (/^\d+(\.\d+)?$/.test(val)) {
              if (
                val.startsWith('0') &&
                !val.startsWith('0.') &&
                val.length > 1
              ) {
                // Keep as string (e.g. phone number starting with 0)
              } else {
                const num = Number(val);
                if (!isNaN(num)) {
                  req.body[key] = num;
                }
              }
            }
          }
        }
      }
      return next.handle();
    }
  }

  return mixin(ParseJsonBodyInterceptor);
}
