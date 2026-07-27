// prisma/seeds/roles-and-permissions.ts

import { PrismaClient } from '@prisma/client';
import { permissions } from 'src/_modules/authorization/providers/permissions.provider';
import { AdminRole } from 'src/_modules/authorization/providers/roles/admin.role.provider';
import { CustomerRole } from 'src/_modules/authorization/providers/roles/customer.role.provider';
import { DeliveryRole } from 'src/_modules/authorization/providers/roles/delivery.role.provider';
import { StoreRole } from 'src/_modules/authorization/providers/roles/store.role.provider';

const roles = [AdminRole, CustomerRole,StoreRole,DeliveryRole];

export async function seedPermissions(prisma: PrismaClient) {
  for (const perm of permissions) {
    for (const method of perm.methods) {
      await prisma.permission.upsert({
        where: {
          prefix_method: {
            prefix: perm.prefix,
            method,
          },
        },
        create: {
          name: perm.name,
          prefix: perm.prefix,
          default: perm.default,
          method,
        },
        update: {
          prefix: perm.prefix,
          default: perm.default,
          name: perm.name,
          method,
        },
      });
    }
  }
  // eslint-disable-next-line no-console
  console.log('✅ Permissions seeded');
}

export async function seedRoles(prisma: PrismaClient) {
  for (const role of roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      create: {
        id: role.id,
        name: role.name,
        default: true,
        roleKey: role.key,
        
      },
      update: {
        id: role.id,
        name: role.name,
        default: true,
        roleKey: role.key,
      },
    });
  }
  // eslint-disable-next-line no-console
  console.log('✅ Roles seeded');
}

export async function seedRolePermissions(prisma: PrismaClient) {
  for (const role of roles) {
    const dbRole = await prisma.role.findFirst({
      where: { roleKey: role.key },
    });
    if (!dbRole) continue;

    for (const rel of role.permissions) {
      const permDef = permissions[rel.index];
      if (!permDef) continue;

      for (const methodIdx of rel.methods) {
        const dbPerm = await prisma.permission.findUnique({
          where: {
            prefix_method: {
              prefix: permissions[rel.index].prefix,
              method: permissions[rel.index].methods[methodIdx],
            },
          },
        });
        if (!dbPerm) continue;

        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: dbRole.id,
              permissionId: dbPerm.id,
            },
          },
          create: {
            roleId: dbRole.id,
            permissionId: dbPerm.id,
          },
          update: {},
        });
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log('✅ RolePermissions seeded');
}
