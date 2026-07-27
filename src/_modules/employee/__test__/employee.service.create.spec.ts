// EmployeeService.create() had NO duplicate email/phone check before
// prisma.user.create() at all — a duplicate crashed straight into the DB's
// unique constraint instead of a clean, predictable error.
import { ConflictException } from '@nestjs/common';
import { EmployeeService } from '../employee.service';

const buildService = (existingUser: any = null) => {
  const helpers = {
    isRoleValid: jest.fn().mockResolvedValue({ id: 1, roleKey: 'Store' }),
    resolveEmployeeBranchId: jest.fn().mockResolvedValue(10),
  };
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(existingUser),
      create: jest.fn().mockResolvedValue({ id: 1 }),
    },
  };
  const service = new EmployeeService(
    prisma as any,
    undefined as any, // Language
    helpers as any,
  );
  return { service, prisma, helpers };
};

describe('EmployeeService.create — duplicate email/phone check', () => {
  it('rejects with a clean ConflictException when the email or phone is already used for this role', async () => {
    const { service, prisma } = buildService({ id: 99 });

    await expect(
      service.create({
        email: 'a@a.com',
        phone: '01012345678',
        password: 'x',
        roleId: 1,
        storeId: 5,
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ email: 'a@a.com' }, { phone: '01012345678' }],
        roleKey: 'Store',
        deletedAt: null,
      },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates the employee normally when no duplicate exists', async () => {
    const { service, prisma, helpers } = buildService(null);

    await service.create({
      email: 'new@a.com',
      phone: '01099999999',
      password: 'x',
      roleId: 1,
      storeId: 5,
    } as any);

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(helpers.resolveEmployeeBranchId).toHaveBeenCalledWith(5, undefined);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ branchId: 10 }) }),
    );
  });
});
