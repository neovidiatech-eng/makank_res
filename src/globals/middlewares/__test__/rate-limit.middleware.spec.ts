// NestMiddleware runs outside the Nest request pipeline, so the global
// exception filter never sees anything a middleware throws — a
// `throw new HttpException(...)` here becomes an unhandled rejection that
// Express turns into a bare, unformatted 500 instead of the intended 429.
// This silently broke EVERY route once the throws were enabled (previously
// commented out) — any client that crossed the request threshold on any
// endpoint got a 500, not a 429, until the 1-hour block expired.
jest.mock('src/redis/redis.provider', () => ({
  redisClient: {
    get: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    set: jest.fn(),
  },
}));

import { HttpStatus } from '@nestjs/common';
import { redisClient } from 'src/redis/redis.provider';
import { RateLimitMiddleware } from '../rate-limit.middleware';

const buildReqRes = (path = '/api/users') => {
  const req = {
    originalUrl: path,
    baseUrl: path,
    ip: '1.2.3.4',
    socket: { remoteAddress: '1.2.3.4' },
  } as any;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as any;
  const next = jest.fn();
  return { req, res, next };
};

describe('RateLimitMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends a real 429 response (not a throw) once already blocked, and never calls next()', async () => {
    (redisClient.get as jest.Mock).mockResolvedValue('1');
    const middleware = new RateLimitMiddleware();
    const { req, res, next } = buildReqRes();

    await middleware.use(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('sends a 429 and sets the block key once the request count crosses the max', async () => {
    (redisClient.get as jest.Mock).mockResolvedValue(null);
    (redisClient.incr as jest.Mock).mockResolvedValue(101); // over the default 100 max
    const middleware = new RateLimitMiddleware();
    const { req, res, next } = buildReqRes();

    await middleware.use(req, res, next);

    expect(redisClient.set).toHaveBeenCalledWith(
      expect.stringContaining('rate-limit-blocked:'),
      '1',
      'EX',
      expect.any(Number),
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() normally when under the threshold', async () => {
    (redisClient.get as jest.Mock).mockResolvedValue(null);
    (redisClient.incr as jest.Mock).mockResolvedValue(5);
    const middleware = new RateLimitMiddleware();
    const { req, res, next } = buildReqRes();

    await middleware.use(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fails open (calls next()) when Redis itself errors', async () => {
    (redisClient.get as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    const middleware = new RateLimitMiddleware();
    const { req, res, next } = buildReqRes();

    await middleware.use(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('skips rate limiting entirely for media routes', async () => {
    const middleware = new RateLimitMiddleware();
    const { req, res, next } = buildReqRes('/api/media/some-file.png');

    await middleware.use(req, res, next);

    expect(redisClient.get).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
