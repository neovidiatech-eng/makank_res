import { Injectable, Logger } from '@nestjs/common';
import { redisClient } from 'src/redis/redis.provider';
import { PrivateSettingService } from './settings.service';

@Injectable()
export class AfkBreakService {
  private readonly logger = new Logger(AfkBreakService.name);

  private readonly breaksKey = 'delivery:afk-breaks';
  private pendingKey(userId: number) {
    return 'delivery:afk-pending:' + userId;
  }

  constructor(private readonly settingService: PrivateSettingService) {}

  /**
   * Whether the forced-break punishment is enabled. Controlled by the
   * `deliveryAfkBreakEnabled` BOOLEAN setting (dashboard-toggleable).
   *
   * Fail-safe = ENABLED: a missing row, unset/unrecognized value, or any read
   * error keeps enforcement on, so behaviour is unchanged until an admin
   * explicitly turns it off. Only an explicit false token disables it — a blank
   * or garbage value can never silently disable the punishment.
   */
  async isEnabled(): Promise<boolean> {
    try {
      const settings = await this.settingService.getSettings(
        'deliveryAfkBreakEnabled',
      );
      const val = settings?.['deliveryAfkBreakEnabled'];

      // Missing row / unset -> default ON (preserve current behavior).
      if (val === undefined || val === null) return true;
      if (typeof val === 'boolean') return val;
      if (typeof val === 'number') return val !== 0;

      // Only explicit false tokens disable; anything else stays ON.
      const s = String(val).trim().toLowerCase();
      if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
      return true;
    } catch (error) {
      this.logger.warn(
        `isEnabled failed, defaulting to enabled: ${(error as Error)?.message}`,
      );
      return true;
    }
  }

  async getBreakMinutes(): Promise<number> {
    try {
      const settings = await this.settingService.getSettings(
        'deliveryAfkBreakMinutes',
      );
      const minutes = Number(settings?.['deliveryAfkBreakMinutes']);
      return Number.isFinite(minutes) && minutes > 0 ? minutes : 15;
    } catch (error) {
      this.logger.warn(
        `getBreakMinutes failed, falling back to 15: ${error?.message}`,
      );
      return 15;
    }
  }

  async suspend(userId: number): Promise<Date> {
    const minutes = await this.getBreakMinutes();
    const breakUntil = new Date(Date.now() + minutes * 60 * 1000);
    try {
      await redisClient.zadd(
        this.breaksKey,
        breakUntil.getTime(),
        String(userId),
      );
    } catch (error) {
      this.logger.warn(`suspend failed for ${userId}: ${error?.message}`);
    }
    return breakUntil;
  }

  async isOnBreak(userId: number): Promise<boolean> {
    try {
      const score = await redisClient.zscore(this.breaksKey, String(userId));
      if (!score) return false;
      return Number(score) > Date.now();
    } catch (error) {
      // Fail-open: never block a driver because Redis is down.
      return false;
    }
  }

  async getBreakUntil(userId: number): Promise<Date | null> {
    try {
      const score = await redisClient.zscore(this.breaksKey, String(userId));
      if (!score) return null;
      const ms = Number(score);
      return ms > Date.now() ? new Date(ms) : null;
    } catch (error) {
      return null;
    }
  }

  async markPending(userId: number): Promise<void> {
    try {
      await redisClient.set(this.pendingKey(userId), '1', 'EX', 86400);
    } catch (error) {
      this.logger.warn(`markPending failed for ${userId}: ${error?.message}`);
    }
  }

  async hasPending(userId: number): Promise<boolean> {
    try {
      const val = await redisClient.get(this.pendingKey(userId));
      return val === '1';
    } catch (error) {
      return false;
    }
  }

  async clearPending(userId: number): Promise<void> {
    try {
      await redisClient.del(this.pendingKey(userId));
    } catch (error) {
      this.logger.warn(`clearPending failed for ${userId}: ${error?.message}`);
    }
  }

  async getDueBreaks(): Promise<number[]> {
    try {
      const members = await redisClient.zrangebyscore(
        this.breaksKey,
        0,
        Date.now(),
      );
      return members.map((m) => Number(m)).filter((n) => Number.isFinite(n));
    } catch (error) {
      return [];
    }
  }

  async clearBreak(userId: number): Promise<void> {
    try {
      await redisClient.zrem(this.breaksKey, String(userId));
    } catch (error) {
      this.logger.warn(`clearBreak failed for ${userId}: ${error?.message}`);
    }
  }
}
