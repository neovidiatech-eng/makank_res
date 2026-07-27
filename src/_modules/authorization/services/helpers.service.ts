import { BadRequestException, Injectable } from '@nestjs/common';
import { validatePermissions } from 'src/globals/helpers/validatePermissions.helper';
import { PrismaService } from 'src/globals/services/prisma.service';
import { RolesKeys } from '../providers/roles';

@Injectable()
export class HelpersService {
  constructor(private readonly prisma: PrismaService) {}
  async canUserAccessRoleId(user: CurrentUser, roleId: Id) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId },
    });
    if (!role) {
      throw new BadRequestException('Role not found');
    }

    if (role.default && user.Role.roleKey !== RolesKeys.ADMIN) {
      const hasPermission = validatePermissions(
        `roles_manage`,
        user.permissions as any[],
      );
      if (!hasPermission) {
        throw new BadRequestException('You cannot modify a default role');
      }
    }
    if (
      user.Role.roleKey !== RolesKeys.ADMIN &&
      role.storeId !== user.storeId
    ) {
      throw new BadRequestException(
        'You cannot modify a role from another store',
      );
    }
    return role;
  }
}
