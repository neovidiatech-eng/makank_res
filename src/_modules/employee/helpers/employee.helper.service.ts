import { BadRequestException, Injectable } from '@nestjs/common';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class HelpersService {
  constructor(private readonly prisma: PrismaService) {}
  // No branchId means the employee's order list/notifications (both scoped
  // by branchId) never match anything — so a branch is always required, but
  // it's auto-resolved when the store only has one (the common case) instead
  // of forcing every caller to look it up first.
  async resolveEmployeeBranchId(storeId: number, branchId?: number) {
    if (branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
      });
      if (!branch || branch.storeId !== storeId) {
        throw new BadRequestException(
          'This branch does not belong to the store',
        );
      }
      return branchId;
    }
    const branches = await this.prisma.branch.findMany({
      where: { storeId },
      select: { id: true },
    });
    if (branches.length === 1) {
      return branches[0].id;
    }
    if (branches.length === 0) {
      throw new BadRequestException('This store has no branches yet');
    }
    throw new BadRequestException(
      'This store has multiple branches — specify branchId for the employee',
    );
  }
  // Every custom role a store creates shares the same roleKey ("Store"), so
  // looking a role up by roleKey alone can't tell two of a store's own roles
  // apart (e.g. "Cashier" vs "Product Manager") — it must be targeted by its
  // actual id, scoped to the caller's store so one store can't borrow another's role.
  async isRoleValid(roleId?: number, storeId?: number) {
    if (roleId && roleId > 0) {
      const role = await this.prisma.role.findFirst({
        where: {
          id: roleId,
          OR: [
            { storeId },
            { default: true, roleKey: RolesKeys.STORE },
          ],
        },
      });
      if (role) return role;
    }

    // Look for an existing Staff role for this store
    let role = await this.prisma.role.findFirst({
      where: {
        storeId,
        default: false,
      },
    });

    // If no custom staff role exists yet, auto-create the standard Staff role
    if (!role && storeId) {
      const staffPerms = await this.prisma.permission.findMany({
        where: {
          OR: [
            { prefix: 'orders', method: { in: ['get', 'patch'] } },
            { prefix: 'services', method: { in: ['get', 'patch'] } },
          ],
        },
      });

      role = await this.prisma.role.create({
        data: {
          name: { ar: 'ستاف', en: 'Staff' },
          roleKey: RolesKeys.STORE,
          default: false,
          storeId,
          RolePermission: {
            create: staffPerms.map((p) => ({ permissionId: p.id })),
          },
        },
      });
    }

    if (!role) {
      throw new BadRequestException('Invalid role');
    }
    return role;
  }
  async canUserAccessEmployee(user: CurrentUser, employeeId: number) {
    const employee = await this.prisma.user.findUnique({
      where: {
        id: employeeId,
      },
      include: {
        Role: true,
      },
    });
    if (!employee) {
      throw new BadRequestException('Invalid employee');
    }
    if (user?.Role?.roleKey === RolesKeys.ADMIN) {
      return employee;
    }
    if (!user?.storeId || employee?.storeId !== user?.storeId) {
      throw new BadRequestException('You do not have access to this employee');
    }
    return employee;
  }
}
