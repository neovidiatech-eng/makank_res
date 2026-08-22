import {
  applyDecorators,
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';

@Injectable()
export class AttachStoreIdInterceptor implements NestInterceptor {
  constructor(
    private readonly ignoreGet: boolean = false,
    private readonly ignorePost: boolean = false,
    private readonly ignorePatch: boolean = false,
    private readonly storeIdOptionalForManagementUser: boolean = false,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method.toUpperCase();
    const user = request.user as CurrentUser;

    // Optional-auth (visitor) routes can reach here with no authenticated user.
    // Skip store scoping entirely in that case so we never dereference a null user.
    // Protected POST/PATCH/GET routes always have a user (the JWT guard rejects
    // missing tokens before this interceptor runs), so their behavior is unchanged.
    if (!user) return next.handle();

    const body = request.body;
    const filters = request.query;

    if (method === 'POST' && !this.ignorePost) {
      if (user.Role.roleKey !== RolesKeys.STORE) {
        if (!body.storeId && !this.storeIdOptionalForManagementUser) {
          throw new BadRequestException('storeId is required for admin user');
        }
      } else {
        if (user.storeId) body.storeId = user.storeId;
      }
    }

    if (method === 'GET' && !this.ignoreGet) {
      if (user.Role.roleKey == RolesKeys.STORE) {
        if (user.storeId) filters.storeId = user.storeId;
        if (user.branchId && !filters.branchId) filters.branchId = user.branchId;
      }
    }

    if (method === 'PATCH' && !this.ignorePatch) {
      delete body?.storeId;
    }

    return next.handle();
  }
}

export function AttachStoreId(parameters?: {
  ignoreGet?: boolean;
  ignorePost?: boolean;
  ignorePatch?: boolean;
  storeIdOptionalForManagementUser?: boolean;
}) {
  return applyDecorators(
    UseInterceptors(
      new AttachStoreIdInterceptor(
        parameters?.ignoreGet,
        parameters?.ignorePost,
        parameters?.ignorePatch,
        parameters?.storeIdOptionalForManagementUser,
      ),
    ),
  );
}
