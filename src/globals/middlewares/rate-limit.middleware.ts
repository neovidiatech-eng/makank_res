import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { redisClient } from 'src/redis/redis.provider';

const WINDOW_SECONDS = Number(env('WINDOW_SECONDS')) || 60; // 1 minute
const MAX_REQUESTS = Number(env('MAX_REQUESTS')) || 100;
const BLOCK_DURATION_SECONDS = Number(env('BLOCK_DURATION_SECONDS')) || 3600; // 1 hour

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    const routePath = req.originalUrl
      ? req.originalUrl.split('?')[0]
      : req.baseUrl;
    if (routePath.startsWith('/media') || routePath.startsWith('/api/media')) {
      // Skip rate limiting for media requests
      return next();
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `rate-limit:${routePath}:${ip}`;
    const blockKey = `rate-limit-blocked:${routePath}:${ip}`;

    try {
      const isBlocked = await redisClient.get(blockKey);
      if (isBlocked) {
        // NestMiddleware runs outside the Nest request pipeline — the global
        // exception filter never sees anything thrown from here, so a
        // `throw new HttpException(...)` doesn't become a 429, it becomes an
        // unhandled rejection that Express turns into a bare 500. Middleware
        // must write the response itself instead of throwing.
        res
          .status(HttpStatus.TOO_MANY_REQUESTS)
          .json({ message: 'Too many requests - try again later' });
        return;
      }

      const current = await redisClient.incr(key);

      if (current === 1) {
        await redisClient.expire(key, WINDOW_SECONDS);
      }
      if (current > MAX_REQUESTS) {
        await redisClient.set(blockKey, '1', 'EX', BLOCK_DURATION_SECONDS);
        res.status(HttpStatus.TOO_MANY_REQUESTS).json({
          message: 'Too many requests - you are blocked for 1 hour',
        });
        return;
      }
    } catch {
      // Fail open if Redis encounters an issue — never block real traffic
      // because the rate-limit store itself had a hiccup.
    }

    next();
  }
}

