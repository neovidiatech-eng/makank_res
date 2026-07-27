import { RefreshTokenStrategy } from '../strategies/refresh-token.strategy';

describe('RefreshTokenStrategy.validate — carries session locale forward', () => {
  const originalEnvMock = (global.env as jest.Mock).getMockImplementation();

  beforeAll(() => {
    (global.env as jest.Mock).mockImplementation((key: string) =>
      key === 'REFRESH_TOKEN_SECRET' ? 'test-secret' : originalEnvMock(key),
    );
  });

  afterAll(() => {
    (global.env as jest.Mock).mockImplementation(originalEnvMock);
  });

  const buildStrategy = (session: any, user: any) => {
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    };
    const configService = { get: jest.fn() };
    const strategy = new RefreshTokenStrategy(prisma as any, configService as any);
    return strategy;
  };

  const request = { headers: {}, clientIp: '1.2.3.4' } as any;

  it('returns the found session languageId alongside id/jti/Role', async () => {
    const session = { jti: 'jti-1', ipAddress: '1.2.3.4', languageId: 'ar' };
    const user = {
      id: 1,
      active: true,
      Role: { id: 1, roleKey: 'Customer' },
      Sessions: [{ jti: 'jti-1' }],
    };
    const strategy = buildStrategy(session, user);

    const result = await strategy.validate(request, {
      id: 1,
      jti: 'jti-1',
      iat: 0,
      exp: 0,
    });

    expect(result).toEqual({
      id: 1,
      jti: 'jti-1',
      Role: user.Role,
      languageId: 'ar',
    });
  });

  it('returns undefined languageId when the session never had one set', async () => {
    const session = { jti: 'jti-1', ipAddress: '1.2.3.4', languageId: null };
    const user = {
      id: 1,
      active: true,
      Role: { id: 1, roleKey: 'Customer' },
      Sessions: [{ jti: 'jti-1' }],
    };
    const strategy = buildStrategy(session, user);

    const result = await strategy.validate(request, {
      id: 1,
      jti: 'jti-1',
      iat: 0,
      exp: 0,
    });

    expect((result as any).languageId).toBeNull();
  });

  it('still succeeds when the request IP differs from the login IP (mobile clients change networks constantly)', async () => {
    const session = { jti: 'jti-1', ipAddress: '9.9.9.9', languageId: 'ar' };
    const user = {
      id: 1,
      active: true,
      Role: { id: 1, roleKey: 'Customer' },
      Sessions: [{ jti: 'jti-1' }],
    };
    const strategy = buildStrategy(session, user);

    const result = await strategy.validate(request, {
      id: 1,
      jti: 'jti-1',
      iat: 0,
      exp: 0,
    });

    expect(result).toEqual({
      id: 1,
      jti: 'jti-1',
      Role: user.Role,
      languageId: 'ar',
    });
  });
});
