import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class RoleTypeGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredUserRole = this.reflector.getAllAndOverride<string[]>(
      env('ROLE_METADATA_KEY'),
      [context.getClass(), context.getHandler()],
    );
    const {
      user: { role: role },
    } = context.switchToHttp().getRequest();

    if (
      !Array.isArray(requiredUserRole) ||
      !requiredUserRole.includes(role.baseRole)
    ) {
      return false;
    }

    return true;
  }
}
