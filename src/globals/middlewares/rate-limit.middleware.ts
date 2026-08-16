import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { redisClient } from 'src/redis/redis.provider';

const WINDOW_SECONDS = Number(env('WINDOW_SECONDS')) || 60; // 1 minute
const MAX_REQUESTS =
  Number(env('MAX_REQUESTS')) || Number(env('RATE_LIMIT_MAX')) || 1000;

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    // Master kill-switch env variable
    if (
      env('DISABLE_RATE_LIMIT') === 'true' ||
      env('ENABLE_RATE_LIMIT') === 'false'
    ) {
      return next();
    }

    const routePath = req.originalUrl
      ? req.originalUrl.split('?')[0]
      : req.baseUrl;

    // Skip rate limiting for high-frequency operational routes & media
    if (
      routePath.startsWith('/media') ||
      routePath.startsWith('/api/media') ||
      routePath.startsWith('/delivery') ||
      routePath.startsWith('/api/delivery') ||
      routePath.startsWith('/orders') ||
      routePath.startsWith('/api/orders') ||
      routePath.startsWith('/admin-notifications') ||
      routePath.startsWith('/api/admin-notifications') ||
      routePath.startsWith('/notifications') ||
      routePath.startsWith('/api/notifications') ||
      routePath.startsWith('/socket.io') ||
      routePath.startsWith('/orders-tracking')
    ) {
      return next();
    }

    // Try to extract user identifier from auth header to avoid sharing NAT IP limits
    const authHeader = req.headers['authorization'] || '';
    const clientIdentifier = authHeader.startsWith('Bearer ')
      ? `token:${authHeader.slice(7, 30)}`
      : `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;

    const key = `rate-limit:${routePath}:${clientIdentifier}`;

    try {
      const current = await redisClient.incr(key);

      if (current === 1) {
        await redisClient.expire(key, WINDOW_SECONDS);
      }
      if (current > MAX_REQUESTS) {
        res.status(HttpStatus.TOO_MANY_REQUESTS).json({
          message: 'Too many requests - please wait a moment and try again',
        });
        return;
      }
    } catch {
      // Fail open if Redis encounters an issue — never block real traffic
    }

    next();
  }
}

