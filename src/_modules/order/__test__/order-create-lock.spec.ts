// OrderService.withUserOrderLock — closes the race condition where two
// near-simultaneous create() calls from the SAME user could both pass the
// 20s idempotency check before either had actually inserted its order,
// resulting in two real duplicate orders. Locking is per-user, best-effort
// (fails open if Redis is unreachable), and must never affect other users.
const redisState = new Map<string, string>();

jest.mock('src/redis/redis.provider', () => ({
  redisClient: {
    set: jest.fn(),
    eval: jest.fn(),
  },
}));

import { redisClient } from 'src/redis/redis.provider';
import { OrderService } from '../order.service';

const buildService = () =>
  new OrderService(
    undefined as any, // prisma
    undefined as any, // languages
    undefined as any, // helpers
    undefined as any, // walletService
    undefined as any, // paymentService
    undefined as any, // transactionService
    undefined as any, // notificationService
    undefined as any, // mapService
    undefined as any, // settingService
    undefined as any, // assignmentService
    undefined as any, // serviceHelper
    undefined as any, // kashierService
    undefined as any, // zoneService
    undefined as any, // afkBreakService
    undefined as any, // logsService
    { broadcastNewOrder: jest.fn(), broadcastOrderStatusChanged: jest.fn() } as any, // orderTrackingGateway
  );

describe('OrderService.withUserOrderLock', () => {
  beforeEach(() => {
    redisState.clear();
    jest.clearAllMocks();
    (redisClient.set as jest.Mock).mockImplementation(
      async (key: string, value: string, _px: string, _ttl: number, nx: string) => {
        if (nx === 'NX' && redisState.has(key)) return null;
        redisState.set(key, value);
        return 'OK';
      },
    );
    (redisClient.eval as jest.Mock).mockImplementation(
      async (_script: string, _numKeys: number, key: string, token: string) => {
        if (redisState.get(key) === token) {
          redisState.delete(key);
          return 1;
        }
        return 0;
      },
    );
  });

  it('runs the function normally when the lock is free, then releases it', async () => {
    const service = buildService();
    const fn = jest.fn().mockResolvedValue('order-1');

    const result = await (service as any).withUserOrderLock(42, fn);

    expect(result).toBe('order-1');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(redisState.size).toBe(0); // lock released
  });

  it('serializes two concurrent calls for the SAME user — second waits for the first', async () => {
    const service = buildService();
    const events: string[] = [];

    const slowFn = async () => {
      events.push('first-start');
      await new Promise((r) => setTimeout(r, 150));
      events.push('first-end');
      return 'first';
    };
    const secondFn = async () => {
      events.push('second-start');
      return 'second';
    };

    const [firstResult, secondResult] = await Promise.all([
      (service as any).withUserOrderLock(42, slowFn),
      // Start slightly after so it reliably finds the lock already held.
      new Promise((resolve) =>
        setTimeout(
          () => resolve((service as any).withUserOrderLock(42, secondFn)),
          20,
        ),
      ),
    ]);

    expect(firstResult).toBe('first');
    expect(secondResult).toBe('second');
    // The second call's fn must not start until the first one finished.
    expect(events).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('does NOT serialize calls for DIFFERENT users', async () => {
    const service = buildService();
    const events: string[] = [];

    const fnA = async () => {
      events.push('A-start');
      await new Promise((r) => setTimeout(r, 100));
      events.push('A-end');
    };
    const fnB = async () => {
      events.push('B-start');
      await new Promise((r) => setTimeout(r, 10));
      events.push('B-end');
    };

    await Promise.all([
      (service as any).withUserOrderLock(1, fnA),
      (service as any).withUserOrderLock(2, fnB),
    ]);

    // B (a different user) finishes while A is still running — proves no
    // cross-user blocking occurred.
    expect(events.indexOf('B-end')).toBeLessThan(events.indexOf('A-end'));
  });

  it('fails open (still runs fn) when Redis throws', async () => {
    (redisClient.set as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    const service = buildService();
    const fn = jest.fn().mockResolvedValue('ok-anyway');

    const result = await (service as any).withUserOrderLock(42, fn);

    expect(result).toBe('ok-anyway');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('skips locking entirely when userId is undefined', async () => {
    const service = buildService();
    const fn = jest.fn().mockResolvedValue('no-lock-needed');

    const result = await (service as any).withUserOrderLock(undefined, fn);

    expect(result).toBe('no-lock-needed');
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it('propagates an error from fn and still releases the lock', async () => {
    const service = buildService();
    const fn = jest.fn().mockRejectedValue(new Error('boom'));

    await expect((service as any).withUserOrderLock(42, fn)).rejects.toThrow(
      'boom',
    );
    expect(redisState.size).toBe(0); // released even though fn threw
  });
});
