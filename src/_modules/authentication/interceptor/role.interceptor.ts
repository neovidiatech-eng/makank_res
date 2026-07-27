import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';

@Injectable()
export class RoleInterceptor implements NestInterceptor {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request: Request & { user: CurrentUser; query: any } = context
      .switchToHttp()
      .getRequest();
    request.body.roleKey = request.params.roleKey;
    return next.handle();
  }
}
