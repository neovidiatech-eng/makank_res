import { SessionType } from '@prisma/client';
import { TokenService } from '../services/jwt.service';

const buildService = (envValues: Record<string, string>) => {
  const prisma = {
    $connect: jest.fn(),
    session: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const configService = {
    get: jest.fn((key: string) => envValues[key]),
  };
  const service = new TokenService(prisma as any, configService as any);
  return { service, prisma };
};

describe('TokenService — session cleanup cron converts seconds to ms', () => {
  const REAL_NOW = 1_700_000_000_000; // fixed epoch ms

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(REAL_NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cleanExpiredRefreshTokens: 604800 (7 days in seconds) cuts off 7 days ago, not 604800ms ago', async () => {
    const { service, prisma } = buildService({
      REFRESH_TOKEN_EXPIRE_TIME: '604800',
    });

    await service.cleanExpiredRefreshTokens();

    const call = (prisma.session.deleteMany as jest.Mock).mock.calls[0][0];
    expect(call.where.type).toBe(SessionType.REFRESH);

    const cutoff = call.where.createdAt.lte.getTime();
    const sevenDaysMs = 604800 * 1000;
    expect(REAL_NOW - cutoff).toBe(sevenDaysMs);
    // Guard against the historical bug (treating the seconds value as ms,
    // which would produce a cutoff only ~10 minutes in the past).
    expect(REAL_NOW - cutoff).not.toBe(604800);
  });

  it('cleanExpiredAccessTokens: 86400 (1 day in seconds) cuts off 1 day ago', async () => {
    const { service, prisma } = buildService({
      ACCESS_TOKEN_EXPIRE_TIME: '86400',
    });

    await service.cleanExpiredAccessTokens();

    const call = (prisma.session.deleteMany as jest.Mock).mock.calls[0][0];
    const cutoff = call.where.createdAt.lte.getTime();
    expect(REAL_NOW - cutoff).toBe(86400 * 1000);
  });
});
