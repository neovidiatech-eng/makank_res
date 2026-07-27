import Redis from 'ioredis';

export const redisClient = new Redis({
  host: env('REDIS_HOST'),
  port: env('REDIS_PORT'),
  lazyConnect: true,
});

redisClient.on('error', (err) => {
  if ((err as any).code === 'ECONNREFUSED') {
    // Silent
  }
});
