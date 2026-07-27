// UserService.create() — the duplicate-user check only forwarded email to
// userExistOrThrow(), never phone, so a duplicate phone number for the same
// role slipped past the clean validation check and hit the DB's unique
// constraint directly on the insert instead.
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { UserService } from '../services/user.service';

const buildService = (helperOverrides: Partial<any> = {}) => {
  const helper = {
    userExistOrThrow: jest.fn().mockResolvedValue(undefined),
    ...helperOverrides,
  };
  const prisma = {
    role: {
      findUnique: jest.fn().mockResolvedValue({ id: 1, roleKey: RolesKeys.ADMIN }),
    },
    user: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  const service = new UserService(
    prisma as any,
    undefined as any, // Token
    undefined as any, // OTP
    helper as any,
  );
  return { service, prisma, helper };
};

const adminCreator = { Role: { roleKey: RolesKeys.ADMIN } } as any;

describe('UserService.create — duplicate check includes phone', () => {
  it('passes both email and phone to userExistOrThrow', async () => {
    const { service, helper } = buildService();

    await service.create(
      {
        email: 'a@a.com',
        phone: '01012345678',
        password: 'x',
        roleId: 1,
      } as any,
      adminCreator,
    );

    expect(helper.userExistOrThrow).toHaveBeenCalledWith({
      email: 'a@a.com',
      phone: '01012345678',
      roleKey: RolesKeys.ADMIN,
    });
  });

  it('rejects when the duplicate check throws (e.g. phone already used)', async () => {
    const { service } = buildService({
      userExistOrThrow: jest.fn().mockRejectedValue(new Error('user_already_exist')),
    });

    await expect(
      service.create(
        { email: 'a@a.com', phone: '01012345678', password: 'x', roleId: 1 } as any,
        adminCreator,
      ),
    ).rejects.toThrow('user_already_exist');
  });
});
