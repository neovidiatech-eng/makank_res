// login() used to spread the whole DTO (`...dto`) into userHelper.userExist(),
// which ANDs every provided field into the lookup. The login DTO's `phone`
// field is optional and unrelated to email+password auth, but if a client
// sent ANY phone value that didn't byte-for-byte match the stored one
// (e.g. "01216610702" vs the stored "+201216610702"), the lookup silently
// matched no user and login failed with "invalid credentials" even though
// the email+password were completely correct.
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { BaseAuthenticationService } from '../services/base.authentication.service';

const buildService = () => {
  const prisma = {
    language: { findUnique: jest.fn().mockResolvedValue({ key: 'en' }) },
  };
  const userHelper = {
    userExist: jest.fn().mockResolvedValue({ id: 1, roleKey: RolesKeys.STORE }),
  };
  const userService = {
    getProfile: jest.fn().mockResolvedValue({
      user: { id: 1 },
      unReadNotifications: 0,
    }),
  };
  const tokenService = {
    generateToken: jest.fn().mockResolvedValue('token'),
  };
  const logsService = { createLog: jest.fn().mockResolvedValue(undefined) };

  const service = new BaseAuthenticationService(
    prisma as any,
    tokenService as any,
    userHelper as any,
    userService as any,
    undefined as any, // otpService
    undefined as any, // couponService
    logsService as any,
    undefined as any, // googleAuthService
  );
  return { service, userHelper };
};

describe('BaseAuthenticationService.login — does not match on a stale phone', () => {
  it('never passes phone to userExist, even when the DTO carries one', async () => {
    const { service, userHelper } = buildService();

    await service.login('127.0.0.1', {
      email: 'elsayeedatef@gmail.com',
      phone: '01216610702', // deliberately not matching the stored "+201216610702"
      password: 'correct-password',
      roleKey: RolesKeys.STORE,
      locale: 'en',
    } as any);

    expect(userHelper.userExist).toHaveBeenCalledWith(
      expect.not.objectContaining({ phone: expect.anything() }),
    );
    expect(userHelper.userExist).toHaveBeenCalledWith({
      email: 'elsayeedatef@gmail.com',
      password: 'correct-password',
      roleKey: RolesKeys.STORE,
      message: 'invalid credentials',
      checkVerified: false,
    });
  });
});
