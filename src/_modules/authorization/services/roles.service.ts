import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { grouped } from 'src/_modules/user/helpers/auth.groupBy.helper';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import { CreateRoleDTO, UpdateRoleDTO } from '../dto/role.dto';
import { selectAllRolesOBJ } from '../prisma-args/role.prisma-select';
import { RolesKeys } from '../providers/roles';
import { HelpersService } from './helpers.service';
import { STORE_ALLOWED_PREFIXES } from './permissions.service';

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: HelpersService,
  ) {}

  async getRoles(user: CurrentUser, id?: Id) {
    const selectArgs = selectAllRolesOBJ();
    const isSuper = user?.Role?.roleKey === RolesKeys.ADMIN;

    const roles = await this.prisma.role[firstOrMany(id)]({
      select: selectArgs,
      where: {
        id: id ?? undefined,
        default: false,
        ...(isSuper ? {} : { storeId: user?.storeId }),
      },
    });
    let data = undefined;
    if (id) {
      const permissions = await this.prisma.permission.findMany({
        where: { RolePermission: { some: { roleId: id } } },
      });
      const filteredPermissions = isSuper
        ? permissions
        : permissions.filter((p) => STORE_ALLOWED_PREFIXES.has(p.prefix));
      data = {
        ...roles,
        permissionIds: filteredPermissions.map((p) => p.id),
        Permissions: grouped(filteredPermissions),
      };
    } else {
      data = roles;
    }
    return data;
  }

  async update(id: Id, data: UpdateRoleDTO, user: CurrentUser) {
    await this.helpers.canUserAccessRoleId(user, id);
    const { permissionIds, ...rest } = data;
    const isSuper = user?.Role?.roleKey === RolesKeys.ADMIN;

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: rest,
      });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });

      let validPermissionIds = permissionIds || [];
      if (validPermissionIds.length && !isSuper) {
        const allowedPermissions = await tx.permission.findMany({
          where: { id: { in: validPermissionIds } },
          select: { id: true, prefix: true },
        });
        validPermissionIds = allowedPermissions
          .filter((p) => STORE_ALLOWED_PREFIXES.has(p.prefix))
          .map((p) => p.id);
      }

      if (validPermissionIds.length) {
        await tx.rolePermission.createMany({
          data: validPermissionIds.map((permissionId: Id) => ({
            roleId: id,
            permissionId,
          })),
        });
      }
    });
  }

  async delete(id: Id, user: CurrentUser) {
    await this.helpers.canUserAccessRoleId(user, id);

    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.default) {
      throw new BadRequestException('لا يمكن حذف أدوار النظام الأساسية');
    }

    const assignedUsersCount = await this.prisma.user.count({
      where: { roleId: id },
    });
    if (assignedUsersCount > 0) {
      throw new BadRequestException(
        `لا يمكن حذف هذا الدور لأنه مسند لـ ${assignedUsersCount} موظف/مستخدم حالياً. يرجى تغيير دور الموظفين أولاً.`,
      );
    }

    await this.prisma.role.delete({ where: { id } });
  }

  async post(data: CreateRoleDTO, user: CurrentUser) {
    const { permissionIds, ...rest } = data;
    const isSuper = user?.Role?.roleKey === RolesKeys.ADMIN;

    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          ...rest,
          roleKey: isSuper ? RolesKeys.ADMIN : RolesKeys.STORE,
          storeId: isSuper ? undefined : user.storeId,
        },
      });

      let validPermissionIds = permissionIds || [];
      if (validPermissionIds.length && !isSuper) {
        const allowedPermissions = await tx.permission.findMany({
          where: { id: { in: validPermissionIds } },
          select: { id: true, prefix: true },
        });
        validPermissionIds = allowedPermissions
          .filter((p) => STORE_ALLOWED_PREFIXES.has(p.prefix))
          .map((p) => p.id);
      }

      if (validPermissionIds.length) {
        await tx.rolePermission.createMany({
          data: validPermissionIds.map((permissionId: Id) => ({
            roleId: role.id,
            permissionId,
          })),
        });
      }
    });
  }
  async getAllRoles(id: Id) {
    const data = await this.prisma.role[firstOrMany(id)]({
      where: {
        id: id ?? undefined,
        default: false,
      },
      include: {
        RolePermission: {
          include: {
            Permission: true,
          },
        },
      },
    });
    return data;
  }
}
