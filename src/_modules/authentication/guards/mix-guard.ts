import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { validatePermissions } from 'src/globals/helpers/validatePermissions.helper';

@Injectable()
export class PermissionAndTypeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const requiredPermissions = this.reflector.getAllAndOverride(
      env('PERMISSION_METADATA_KEY') as string,
      [context.getClass(), context.getHandler()],
    );
    const userPermissions =
      context.switchToHttp().getRequest().user?.permissions || [];

    return validatePermissions(
      `${requiredPermissions[0]}_${method.toLowerCase()}`,
      userPermissions,
    );
  }
}
