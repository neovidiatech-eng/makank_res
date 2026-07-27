import { Injectable } from '@nestjs/common';
import { grouped } from 'src/_modules/user/helpers/auth.groupBy.helper';
import { isSuperAdmin } from 'src/globals/helpers/is-super-admin.helper';
import { PrismaService } from 'src/globals/services/prisma.service';
import { UpdatePermissionDTO } from '../dto/permission.dto';

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: CurrentUser) {
    return grouped(
      await this.prisma.permission.findMany({
        where: {
          RolePermission: {
            some: {
              roleId: isSuperAdmin(user) ? undefined : user.Role.id,
            },
          },
        },
      }),
    );
  }

  async update(id: Id, data: UpdatePermissionDTO) {
    await this.prisma.permission.update({ where: { id }, data });
  }
  async getSystemPermissions() {
    const permissions = await this.prisma.permission.findMany({});
    const finalPermissions: {
      name: {};
      prefix: string;
      methods: { id: Id; method: string }[];
    }[] = [];
    for (const permission of permissions) {
      if (finalPermissions.find((p) => p.prefix === permission.prefix)) {
        const index = finalPermissions.findIndex(
          (p) => p.prefix === permission.prefix,
        );
        finalPermissions[index].methods.push({
          id: permission.id,
          method: permission.method,
        });
      } else {
        finalPermissions.push({
          name: permission.name,
          prefix: permission.prefix,
          methods: [{ id: permission.id, method: permission.method }],
        });
      }
    }
    return finalPermissions;
  }
}
