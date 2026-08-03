// UserService.updateCurrentUser() unconditionally attempted a nested
// `Details: { update: {} } }` write. Only Customer accounts ever get a
// Details row created (Store owners/employees/delivery/admin never do),
// so PATCH /users/me crashed with a Prisma P2025 for every non-Customer
// role trying to edit their own profile — regardless of which fields
// they were changing.
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { UserService } from '../services/user.service';

const buildService = () => {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 1, roleKey: RolesKeys.STORE, image: null }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 1 }),
    },
    session: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new UserService(
    prisma as any,
    undefined as any, // Token
    undefined as any, // OTP
    undefined as any, // helper
  );
  return { service, prisma };
};

describe('UserService.updateCurrentUser — non-Customer profile edit', () => {
  it('updates a Store-role user without touching the Details relation', async () => {
    const { service, prisma } = buildService();

    await service.updateCurrentUser(
      { name: 'New Name' } as any,
      1,
      'jti-1',
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { name: 'New Name' },
    });
  });
});
