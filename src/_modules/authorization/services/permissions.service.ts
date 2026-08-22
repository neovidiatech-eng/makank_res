import { Injectable } from '@nestjs/common';
import { grouped } from 'src/_modules/user/helpers/auth.groupBy.helper';
import { isSuperAdmin } from 'src/globals/helpers/is-super-admin.helper';
import { PrismaService } from 'src/globals/services/prisma.service';
import { UpdatePermissionDTO } from '../dto/permission.dto';

export const STORE_ALLOWED_PREFIXES = new Set([
  'categories',
  'services',
  'services/favourite',
  'orders',
  'branches',
  'employees',
  'roles',
  'bundles',
  'variation-templates',
  'specialists',
  'storerating',
  'servicerating',
  'rating',
  'wallet',
  'withdraw',
  'transactions',
  'statistics/store',
  'orders/statistics',
  'payment-verification',
  'schedule',
  'coupons',
  'profile',
  'stores',
  'stores/favourite',
  'customers',
  'notification',
  'complaint',
  'users',
  'languages',
  'settings',
  'social-media',
  'system-notifications',
  'fund',
  'filters',
  'addresses',
]);

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: CurrentUser) {
    const isSuper = isSuperAdmin(user);
    const permissions = await this.prisma.permission.findMany({
      where: isSuper
        ? {}
        : {
            RolePermission: {
              some: {
                roleId: user?.Role?.id,
              },
            },
          },
    });

    const filtered = isSuper
      ? permissions
      : permissions.filter((p) => STORE_ALLOWED_PREFIXES.has(p.prefix));

    return grouped(filtered);
  }

  async update(id: Id, data: UpdatePermissionDTO) {
    await this.prisma.permission.update({ where: { id }, data });
  }

  async getSystemPermissions(user?: CurrentUser) {
    const permissions = await this.prisma.permission.findMany({});
    const isSuper = user ? isSuperAdmin(user) : true;

    const filteredPermissions = isSuper
      ? permissions
      : permissions.filter((p) => STORE_ALLOWED_PREFIXES.has(p.prefix));

    const finalPermissions: {
      name: {};
      prefix: string;
      methods: { id: Id; method: string }[];
    }[] = [];
    for (const permission of filteredPermissions) {
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
