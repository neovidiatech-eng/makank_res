import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionAndTypeGuard } from 'src/_modules/authentication/guards/mix-guard';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { transformFlattenUser } from 'src/_modules/user/prisma-args/user.prisma-select';

describe('Store Admin vs Staff Access Control', () => {
  let guard: PermissionAndTypeGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionAndTypeGuard(reflector);
  });

  const createMockContext = (user: any, method: string, requiredPermissionPrefix: string): ExecutionContext => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([requiredPermissionPrefix]);
    const req = {
      user,
      method,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      getClass: () => ({}),
      getHandler: () => ({}),
    } as any;
  };

  describe('Store Owner (Admin) Permissions', () => {
    const adminUser = {
      id: 1,
      name: 'Admin Owner',
      storeId: 10,
      Role: {
        id: 4,
        name: { ar: 'مركز', en: 'Store' },
        roleKey: RolesKeys.STORE,
        default: true,
        storeId: null,
      },
      permissions: [],
    };

    it('bypasses permission checks for wallet (Admin Allowed)', () => {
      const ctx = createMockContext(adminUser, 'GET', 'wallet');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('bypasses permission checks for withdraw (Admin Allowed)', () => {
      const ctx = createMockContext(adminUser, 'POST', 'withdraw');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('bypasses permission checks for store statistics (Admin Allowed)', () => {
      const ctx = createMockContext(adminUser, 'GET', 'orders/statistics');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('bypasses permission checks for employees management (Admin Allowed)', () => {
      const ctx = createMockContext(adminUser, 'POST', 'employees');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('bypasses permission checks for custom roles management (Admin Allowed)', () => {
      const ctx = createMockContext(adminUser, 'POST', 'roles');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows access to orders (Admin Allowed)', () => {
      const ctx = createMockContext(adminUser, 'GET', 'orders');
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('Store Staff Permissions (Cashier / Worker)', () => {
    const staffUser = {
      id: 2,
      name: 'Store Staff',
      storeId: 10,
      Role: {
        id: 5,
        name: { ar: 'ستاف', en: 'Staff' },
        roleKey: RolesKeys.STORE,
        default: false,
        storeId: 10,
      },
      permissions: [
        { prefix: 'orders', method: 'get' },
        { prefix: 'orders', method: 'patch' },
        { prefix: 'services', method: 'get' },
        { prefix: 'services', method: 'patch' },
      ],
    };

    it('allows staff to view orders (GET orders)', () => {
      const ctx = createMockContext(staffUser, 'GET', 'orders');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows staff to update/accept orders (PATCH orders)', () => {
      const ctx = createMockContext(staffUser, 'PATCH', 'orders');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows staff to view menu items (GET services)', () => {
      const ctx = createMockContext(staffUser, 'GET', 'services');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows staff to toggle item availability (PATCH services)', () => {
      const ctx = createMockContext(staffUser, 'PATCH', 'services');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks staff from viewing wallet (GET wallet -> Forbidden)', () => {
      const ctx = createMockContext(staffUser, 'GET', 'wallet');
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('blocks staff from withdrawing funds (POST withdraw -> Forbidden)', () => {
      const ctx = createMockContext(staffUser, 'POST', 'withdraw');
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('blocks staff from viewing period statistics (GET orders/statistics -> Forbidden)', () => {
      const ctx = createMockContext(staffUser, 'GET', 'orders/statistics');
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('blocks staff from accessing employees (GET employees -> Forbidden)', () => {
      const ctx = createMockContext(staffUser, 'GET', 'employees');
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('blocks staff from managing roles (POST roles -> Forbidden)', () => {
      const ctx = createMockContext(staffUser, 'POST', 'roles');
      expect(guard.canActivate(ctx)).toBe(false);
    });
  });

  describe('User Transformation (transformFlattenUser)', () => {
    it('sets isOwner = true for store owner with default = true', () => {
      const rawOwner = {
        id: 1,
        name: 'Store Owner',
        email: 'owner@test.com',
        phone: '01011111111',
        roleId: 4,
        storeId: 10,
        Role: {
          id: 4,
          name: { ar: 'مركز', en: 'Store' },
          roleKey: 'Store',
          default: true,
          storeId: null,
          RolePermission: [],
        },
      };

      const result = transformFlattenUser(rawOwner);
      expect(result.isOwner).toBe(true);
      expect(result.Role.default).toBe(true);
      expect(result.Role.storeId).toBeNull();
    });

    it('sets isOwner = false for custom staff role with default = false and storeId set', () => {
      const rawStaff = {
        id: 2,
        name: 'Store Cashier',
        email: 'staff@test.com',
        phone: '01022222222',
        roleId: 5,
        storeId: 10,
        Role: {
          id: 5,
          name: { ar: 'كاشير', en: 'Cashier' },
          roleKey: 'Store',
          default: false,
          storeId: 10,
          RolePermission: [],
        },
      };

      const result = transformFlattenUser(rawStaff);
      expect(result.isOwner).toBe(false);
      expect(result.Role.default).toBe(false);
      expect(result.Role.storeId).toBe(10);
    });
  });
});
