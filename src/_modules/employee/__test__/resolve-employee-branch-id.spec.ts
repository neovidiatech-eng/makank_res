// An employee with no branchId can't see their store's orders — the order
// list/notifications for Store-role users are filtered by branchId, so
// null quietly means "sees nothing" instead of "sees everything".
import { BadRequestException } from '@nestjs/common';
import { HelpersService } from '../helpers/employee.helper.service';

const buildHelpers = (branches: any[]) => {
  const prisma = {
    branch: {
      findUnique: jest.fn((args: any) =>
        Promise.resolve(branches.find((b) => b.id === args.where.id) ?? null),
      ),
      findMany: jest.fn((args: any) =>
        Promise.resolve(branches.filter((b) => b.storeId === args.where.storeId)),
      ),
    },
  };
  return { helpers: new HelpersService(prisma as any), prisma };
};

describe('EmployeeHelpersService.resolveEmployeeBranchId', () => {
  it('auto-resolves to the store\'s sole branch when none is given', async () => {
    const { helpers } = buildHelpers([{ id: 7, storeId: 5 }]);
    await expect(helpers.resolveEmployeeBranchId(5, undefined)).resolves.toBe(7);
  });

  it('rejects when the store has multiple branches and none was specified', async () => {
    const { helpers } = buildHelpers([
      { id: 7, storeId: 5 },
      { id: 8, storeId: 5 },
    ]);
    await expect(helpers.resolveEmployeeBranchId(5, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when the store has no branches at all', async () => {
    const { helpers } = buildHelpers([]);
    await expect(helpers.resolveEmployeeBranchId(5, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts an explicit branchId that belongs to the store', async () => {
    const { helpers } = buildHelpers([
      { id: 7, storeId: 5 },
      { id: 8, storeId: 5 },
    ]);
    await expect(helpers.resolveEmployeeBranchId(5, 8)).resolves.toBe(8);
  });

  it('rejects an explicit branchId that belongs to a different store', async () => {
    const { helpers } = buildHelpers([{ id: 9, storeId: 99 }]);
    await expect(helpers.resolveEmployeeBranchId(5, 9)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
