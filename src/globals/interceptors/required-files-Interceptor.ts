import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { mapUploads } from '../helpers/media.helper';

@Injectable()
export class RequiredFileValidationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    const requiredFiles = this.reflector.get<string[]>(
      'requiredFiles',
      context.getHandler(),
    );

    if (requiredFiles && requiredFiles.length > 0) {
      const missingFiles = requiredFiles.filter(
        (field) => !request.files || !request.files[field],
      );

      if (missingFiles.length > 0) {
        throw new BadRequestException('fileRequired', {
          cause: { fileds: missingFiles.join(', ') },
        });
      }
    }

    const files = request.file || request.files;

    mapUploads(request.body, files, true);
    return next.handle();
  }
}
