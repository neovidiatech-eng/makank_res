// canUserAccessEmployee's storeId-match check rejected Admin callers too,
// since Admin accounts have no storeId of their own — even though Admin
// holds the employees:patch/delete permission that's supposed to grant this.
import { BadRequestException } from '@nestjs/common';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { HelpersService } from '../helpers/employee.helper.service';

const buildHelpers = (employee: any) => {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(employee) },
  };
  return new HelpersService(prisma as any);
};

describe('EmployeeHelpersService.canUserAccessEmployee', () => {
  const employee = { id: 1, storeId: 5 };

  it('lets an admin access any employee regardless of storeId', async () => {
    const helpers = buildHelpers(employee);
    const admin = { Role: { roleKey: RolesKeys.ADMIN }, storeId: undefined } as any;
    await expect(helpers.canUserAccessEmployee(admin, 1)).resolves.toEqual(employee);
  });

  it('lets a store user access their own employee', async () => {
    const helpers = buildHelpers(employee);
    const storeUser = { Role: { roleKey: RolesKeys.STORE }, storeId: 5 } as any;
    await expect(helpers.canUserAccessEmployee(storeUser, 1)).resolves.toEqual(employee);
  });

  it('rejects a store user accessing another store\'s employee', async () => {
    const helpers = buildHelpers(employee);
    const storeUser = { Role: { roleKey: RolesKeys.STORE }, storeId: 99 } as any;
    await expect(helpers.canUserAccessEmployee(storeUser, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
