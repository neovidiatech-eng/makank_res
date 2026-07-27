// Regression guard: a brand-new user's first session (verify()) and every
// access-token refresh (refreshToken()) used to call generateToken() without
// a locale, silently defaulting the session's languageId to 'en' regardless
// of the phone's real language — which is why push notifications sometimes
// arrived in English on an Arabic phone.
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { BaseAuthenticationService } from '../services/base.authentication.service';

const buildService = (overrides: Partial<any> = {}) => {
  const tokenService = {
    generateToken: jest.fn().mockResolvedValue('token'),
    ...overrides.tokenService,
  };
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 1,
        roleKey: RolesKeys.CUSTOMER,
        storeId: null,
      }),
      update: jest.fn(),
    },
    store: { update: jest.fn() },
    ...overrides.prisma,
  };
  const userService = {
    getProfile: jest.fn().mockResolvedValue({
      user: { id: 1 },
      unReadNotifications: 0,
    }),
    ...overrides.userService,
  };
  const otpService = {
    verifyOTP: jest.fn().mockResolvedValue(undefined),
    ...overrides.otpService,
  };

  const service = new BaseAuthenticationService(
    prisma as any,
    tokenService as any,
    {} as any, // userHelper
    userService as any,
    otpService as any,
    {} as any, // couponService
    { createLog: jest.fn().mockReturnValue({ catch: jest.fn() }) } as any, // logsService
    {} as any, // googleAuthService
  );

  return { service, tokenService, prisma, userService };
};

describe('BaseAuthenticationService — locale propagation', () => {
  it('verify() passes the resolved locale into both generated sessions', async () => {
    const { service, tokenService } = buildService();

    await service.verify('1.2.3.4', 1, { otp: '1234' } as any, 'ar');

    expect(tokenService.generateToken).toHaveBeenCalledWith(
      1,
      '1.2.3.4',
      undefined,
      'ACCESS',
      'ar',
    );
    expect(tokenService.generateToken).toHaveBeenCalledWith(
      1,
      '1.2.3.4',
      undefined,
      'REFRESH',
      'ar',
    );
  });

  it('verify() still works when no locale is resolved (falls through to generateToken default)', async () => {
    const { service, tokenService } = buildService();

    await service.verify('1.2.3.4', 1, { otp: '1234' } as any);

    expect(tokenService.generateToken).toHaveBeenCalledWith(
      1,
      '1.2.3.4',
      undefined,
      'ACCESS',
      undefined,
    );
  });

  it('refreshToken() passes the inherited session locale into the new ACCESS token', async () => {
    const { service, tokenService } = buildService();

    await service.refreshToken('1.2.3.4', 1, 'ar');

    expect(tokenService.generateToken).toHaveBeenCalledWith(
      1,
      '1.2.3.4',
      undefined,
      'ACCESS',
      'ar',
    );
  });
});
