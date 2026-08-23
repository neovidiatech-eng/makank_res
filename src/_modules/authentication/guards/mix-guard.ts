import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { validatePermissions } from 'src/globals/helpers/validatePermissions.helper';

@Injectable()
export class PermissionAndTypeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Super Admin bypass & default Store Owner bypass
    if (
      user?.Role?.roleKey === RolesKeys.ADMIN ||
      (user?.Role?.roleKey === RolesKeys.STORE && user?.Role?.default === true)
    ) {
      return true;
    }

    const method = request.method;
    const requiredPermissions = this.reflector.getAllAndOverride(
      env('PERMISSION_METADATA_KEY') as string,
      [context.getClass(), context.getHandler()],
    );
    const userPermissions = user?.permissions || [];

    if (!requiredPermissions || !requiredPermissions.length) {
      return true;
    }

    return validatePermissions(
      `${requiredPermissions[0]}_${method.toLowerCase()}`,
      userPermissions,
    );
  }
}
