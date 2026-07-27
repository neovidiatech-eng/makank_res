import {
  applyDecorators,
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';

@Injectable()
export class AttachUserIdInterceptor implements NestInterceptor {
  constructor(
    private readonly ignoreGet: boolean = false,
    private readonly ignorePost: boolean = false,
    private readonly ignorePatch: boolean = false,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method.toUpperCase();

    const user = request.user as CurrentUser;
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }
    const body = request.body;
    const filters = request.query;

    if (method === 'POST' && !this.ignorePost) {
      if (user.Role.roleKey === RolesKeys.ADMIN) {
        if (!body.userId) {
          throw new BadRequestException('userId is required for admin user');
        }
      } else {
        body.userId = user?.id;
      }
    }

    if (method === 'GET' && !this.ignoreGet) {
      if (user.Role.roleKey !== RolesKeys.ADMIN) {
        filters.userId = user?.id;
      }
    }

    if (method === 'PATCH' && !this.ignorePatch) {
      delete body?.userId;
    }

    return next.handle();
  }
}

export function AttachUserId(parameters?: {
  ignoreGet?: boolean;
  ignorePost?: boolean;
  ignorePatch?: boolean;
}) {
  return applyDecorators(
    UseInterceptors(
      new AttachUserIdInterceptor(
        parameters?.ignoreGet,
        parameters?.ignorePost,
        parameters?.ignorePatch,
      ),
    ),
  );
}
