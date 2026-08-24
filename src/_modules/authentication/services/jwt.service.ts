import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionType } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getTokenSecret(type: SessionType): string {
    const tokenSecrets = {
      [SessionType.ACCESS]: this.configService.get<string>(
        'ACCESS_TOKEN_SECRET',
      ),
      [SessionType.REFRESH]: this.configService.get<string>(
        'REFRESH_TOKEN_SECRET',
      ),
      [SessionType.VERIFY]: this.configService.get<string>(
        'VERIFY_TOKEN_SECRET',
      ),
      [SessionType.PASSWORD_RESET]: this.configService.get<string>(
        'RESET_PASSWORD_TOKEN_SECRET',
      ),
    };
    return tokenSecrets[type];
  }

  // Must mirror the `maxAge` each strategy checks (access/refresh-token.strategy.ts,
  // verify/reset-password-token.strategy.ts) — otherwise the JWT's own `exp` claim
  // expires the token earlier than the session/strategy actually allows.
  private getTokenExpiry(type: SessionType): number {
    const tokenExpiries = {
      [SessionType.ACCESS]: +this.configService.get<string>(
        'ACCESS_TOKEN_EXPIRE_TIME',
      ),
      [SessionType.REFRESH]: +this.configService.get<string>(
        'REFRESH_TOKEN_EXPIRE_TIME',
      ),
      [SessionType.VERIFY]: +this.configService.get<string>(
        'FORGET_PASSWORD_TOKEN_EXPIRE_TIME',
      ),
      [SessionType.PASSWORD_RESET]: +this.configService.get<string>(
        'FORGET_PASSWORD_TOKEN_EXPIRE_TIME',
      ),
    };
    return tokenExpiries[type];
  }

  private async getLatestFcmToken(userId: Id) {
    const session = await this.prisma.session.findFirst({
      where: {
        userId,
        fcmToken: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { fcmToken: true },
    });

    return session?.fcmToken ?? null;
  }
  async generateToken(
    userId: Id,
    ipAddress?: string,
    fcmToken?: string,
    type: SessionType = SessionType.ACCESS,
    locale: string = 'ar',
  ): Promise<string> {
    if (
      !([SessionType.ACCESS, SessionType.REFRESH] as SessionType[]).includes(
        type,
      )
    ) {
      await this.prisma.session.deleteMany({
        where: {
          userId,
          type: { notIn: [SessionType.ACCESS, SessionType.REFRESH] },
        },
      });
    }

    const normalizedFcmToken =
      fcmToken ?? (await this.getLatestFcmToken(userId));

    // DEBUG — diagnose sessions created with no FCM token (safe: no full token logged)
    if (!normalizedFcmToken) {
      this.logger.warn(
        `[push-debug] generateToken userId=${userId} type=${type} — no FCM token (provided=${!!fcmToken}). Push will not reach this session.`,
      );
    } else {
      this.logger.debug(
        `[push-debug] generateToken userId=${userId} type=${type} — token prefix=${normalizedFcmToken.slice(0, 8)}…`,
      );
    }

    if (normalizedFcmToken) {
      // Detach this FCM token from any OTHER user's sessions before attaching it to
      // the new one, so a shared device can never leave its token registered under
      // a previous account. Only wipe sessions for different users.
      await this.prisma.session.updateMany({
        where: {
          fcmToken: normalizedFcmToken,
          userId: { not: userId },
        },
        data: {
          fcmToken: null,
        },
      });
    }

    const session = await this.prisma.session.create({
      data: {
        ipAddress,
        userId,
        fcmToken: normalizedFcmToken,
        type,
        languageId: locale,
      },
    });

    const secret = this.getTokenSecret(type);
    const token = jwt.sign({ jti: session.jti, id: userId }, secret, {
      expiresIn: this.getTokenExpiry(type),
    });

    return token;
  }

  async GenerateLessonToken(userId: Id, lessonId: Id, endDate: Date) {
    const payload = { userId, lessonId, endDate };
    const secret = process.env.LESSON_SECRET;

    const token = jwt.sign(payload, secret, {
      expiresIn: Math.floor((endDate.getTime() - Date.now()) / 1000),
    });

    return token;
  }
  async ValidateLessonToken(token: string) {
    const secret = process.env.LESSON_SECRET;
    const decoded = jwt.verify(token, secret);
    return decoded;
  }

  // Cron Cleanup Jobs

  @Cron(CronExpression.EVERY_10_HOURS)
  async cleanExpiredAccessTokens() {
    await this.deleteExpiredSessions(
      SessionType.ACCESS,
      'ACCESS_TOKEN_EXPIRE_TIME',
    );
  }

  @Cron(CronExpression.EVERY_10_HOURS)
  async cleanExpiredRefreshTokens() {
    await this.deleteExpiredSessions(
      SessionType.REFRESH,
      'REFRESH_TOKEN_EXPIRE_TIME',
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanExpiredTemporaryTokens() {
    await this.deleteExpiredSessions(
      [SessionType.PASSWORD_RESET, SessionType.VERIFY],
      'FORGET_PASSWORD_TOKEN_EXPIRE_TIME',
    );
  }

  // Reusable session cleaner
  private async deleteExpiredSessions(
    types: SessionType | SessionType[],
    expiryEnvKey: string,
  ) {
    // Env values are documented/stored in SECONDS (mirrors getTokenExpiry() /
    // jwt's own expiresIn) — convert to ms before subtracting from Date.now(),
    // otherwise this deletes sessions older than a few minutes instead of days.
    const expirationSeconds = +this.configService.get<string>(expiryEnvKey);
    const expirationDate = new Date(Date.now() - expirationSeconds * 1000);
    await this.prisma.$connect();

    const deleted = await this.prisma.session.deleteMany({
      where: {
        type: Array.isArray(types) ? { in: types } : types,
        createdAt: { lte: expirationDate },
      },
    });

    this.logger.log(
      `Deleted ${deleted.count} expired session(s) for type(s): ${Array.isArray(types) ? types.join(', ') : types}`,
    );
  }
}
