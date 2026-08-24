import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  NotificationTargetType,
  NotificationType,
  SessionType,
  SystemNotification,
} from '@prisma/client';
import * as admin from 'firebase-admin';
import { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import * as fs from 'fs';
import * as path from 'path';
import { localizedObject } from '../helpers/localized.return';
import { PrismaService } from './prisma.service';

declare module 'firebase-admin/messaging' {
  interface Messaging {
    sendMulticast(message: MulticastMessage): Promise<BatchResponse>;
  }
}

/**
 * Reads the project_id from google-services.json (Android client config) if
 * the file exists next to the project root. Falls back to FIREBASE_PROJECT_ID
 * env var so local dev / CI can still override via .env.
 */
function resolveFirebaseProjectId(): string | undefined {
  const envId = process.env.FIREBASE_PROJECT_ID;

  try {
    const filePath = path.resolve(process.cwd(), 'google-services.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as { project_info?: { project_id?: string } };
      const fileId = parsed?.project_info?.project_id;
      if (fileId) {
        if (envId && envId !== fileId) {
          new Logger('NotificationService').warn(
            `FIREBASE_PROJECT_ID in .env ("${envId}") does not match ` +
              `google-services.json project_id ("${fileId}"). ` +
              `Using google-services.json value.`,
          );
        }
        return fileId;
      }
    }
  } catch {
    // File unreadable / malformed — fall through to env var
  }

  return envId;
}

export interface NotificationClickTarget {
  targetType: NotificationTargetType;
  storeId?: Id;
  categoryId?: Id;
  serviceId?: Id;
  zoneId?: Id;
  orderId?: Id;
  couponId?: Id;
  url?: string;
  deliveryId?: string | Id;
}

export const buildClickTargetData = (
  clickTarget?: NotificationClickTarget,
): Record<string, string> | undefined => {
  if (
    !clickTarget ||
    clickTarget.targetType === NotificationTargetType.GENERAL
  ) {
    return undefined;
  }

  const data: Record<string, string | undefined> = {
    targetType: clickTarget.targetType,
    storeId: clickTarget.storeId?.toString(),
    categoryId: clickTarget.categoryId?.toString(),
    serviceId: clickTarget.serviceId?.toString(),
    zoneId: clickTarget.zoneId?.toString(),
    orderId: clickTarget.orderId?.toString(),
    couponId: clickTarget.couponId?.toString(),
    url: clickTarget.url,
    deliveryId: clickTarget.deliveryId?.toString(),
  };

  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;
};

export interface PushMetrics {
  totalAttempts: number;
  acceptedByFcm: number;
  failedAtFcm: number;
  invalidTokensCleaned: number;
  lastAttemptAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private firebaseInitialized = false;
  private firebaseInitError?: string;
  private activeProjectId?: string;

  private metrics: PushMetrics = {
    totalAttempts: 0,
    acceptedByFcm: 0,
    failedAtFcm: 0,
    invalidTokensCleaned: 0,
  };

  constructor(private readonly prisma: PrismaService) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (!admin.apps.length && env('NOTIFICATIONS')) {
      try {
        const projectId = resolveFirebaseProjectId();
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

        const missingKeys: string[] = [];
        if (!projectId) missingKeys.push('projectId (FIREBASE_PROJECT_ID or google-services.json)');
        if (!clientEmail) missingKeys.push('clientEmail (FIREBASE_CLIENT_EMAIL)');
        if (!privateKey) missingKeys.push('privateKey (FIREBASE_PRIVATE_KEY)');

        if (missingKeys.length > 0) {
          const errMsg = `Firebase configuration incomplete! Missing: ${missingKeys.join(', ')}`;
          this.logger.error(`[firebase-init] ❌ ${errMsg}`);
          this.firebaseInitError = errMsg;
          this.firebaseInitialized = false;
          return;
        }

        this.logger.log(
          `[firebase-init] Initializing Firebase Admin SDK — projectId=${projectId} ` +
            `clientEmail=${clientEmail.slice(0, 20)}… privateKey=${privateKey.length} chars`,
        );

        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            privateKey,
            clientEmail,
          }),
        });

        this.firebaseInitialized = true;
        this.activeProjectId = projectId;
        this.logger.log(`[firebase-init] ✅ Firebase Admin SDK initialized successfully for project "${projectId}"`);
      } catch (err: any) {
        this.firebaseInitError = err.message;
        this.firebaseInitialized = false;
        this.logger.error(`[firebase-init] ❌ Firebase initialization FAILED: ${err.message}`);
      }
    } else if (admin.apps.length) {
      this.firebaseInitialized = true;
      this.activeProjectId = resolveFirebaseProjectId();
      this.logger.log('[firebase-init] Firebase already initialized — skipping');
    } else {
      this.logger.warn(
        '[firebase-init] ⚠️ NOTIFICATIONS env is falsy — Firebase NOT initialized. Push will be DB-only.',
      );
    }
  }

  /**
   * Resolves and normalizes the image path into an absolute public HTTPS/HTTP URL.
   * Ensures the client receives the complete media URL in both notification payload and data payload.
   */
  resolveImageUrl(rawImage?: string): string | undefined {
    if (!rawImage || rawImage === 'null' || !rawImage.trim()) return undefined;

    let imageUrl: string = rawImage.trim();
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      const baseUrl = env('MAIN_URL') || 'https://mlk.alzikr-academy.com';
      imageUrl = `${baseUrl.replace(/\/$/, '')}/api/media?media=${imageUrl.replace(/^\//, '')}`;
    }

    try {
      const parsed = new URL(imageUrl);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return imageUrl;
      }
    } catch (_) {
      this.logger.warn(`[push-image-val] ⚠️ Invalid image URL: "${imageUrl}"`);
      return undefined;
    }

    return undefined;
  }

  /**
   * Unified Notification Payload Builder (Audit #15)
   * Builds standardized FCM multicast/single message payload compatible with Android and iOS APNs.
   */
  private buildNotificationMessage(options: {
    title: string;
    body: string;
    imageUrl?: string;
    data?: Record<string, string>;
    clickTarget?: NotificationClickTarget;
  }) {
    const { title, body, imageUrl, data, clickTarget } = options;
    const clickTargetData = buildClickTargetData(clickTarget);

    const pushData: Record<string, string> = {
      ...(data ?? {}),
      ...(clickTargetData ?? {}),
      ...(imageUrl ? { image: imageUrl, imageUrl, bigPicture: imageUrl } : {}),
    };

    return {
      notification: {
        title,
        body,
        ...(imageUrl ? { imageUrl } : {}),
      },
      data: Object.keys(pushData).length ? pushData : undefined,
      android: {
        priority: 'high' as const,
        notification: {
          sound: 'notification_sound',
          channelId: 'makank_orders_v2',
          priority: 'high' as const,
          ...(imageUrl ? { imageUrl } : {}),
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            sound: 'notification_sound.mp3',
            ...(imageUrl ? { mutableContent: true } : {}),
          },
        },
        fcmOptions: {
          ...(imageUrl ? { imageUrl } : {}),
        },
      },
    };
  }

  /**
   * Helper to split array into chunks (Batching Audit #4).
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async sendLocalizedNotification(
    userId: Id,
    title: { ar: string; en: string },
    body: { ar: string; en: string },
    data?: Record<string, string>,
    type?: NotificationType,
    resourceId?: Id,
    clickTarget?: NotificationClickTarget,
    image?: string,
  ) {
    if (!userId) {
      this.logger.warn('sendLocalizedNotification called without userId — skipping');
      return;
    }

    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        type: SessionType.ACCESS,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        fcmToken: true,
        languageId: true,
      },
    });

    const locale = sessions[0]?.languageId || 'ar';
    const pickLocalized = (value: { ar: string; en: string }): string => {
      const v = value as unknown as Record<string, string>;
      return v?.[locale] || v?.ar || v?.en || Object.values(v ?? {})[0] || '';
    };

    const localizedTitle = pickLocalized(title);
    const localizedBody = pickLocalized(body);

    const tokens: string[] = [
      ...new Set(
        sessions
          .map((s): string | null => s.fcmToken)
          .filter((t): t is string => Boolean(t && t.trim().length > 0)),
      ),
    ];

    this.logger.log(
      `[push] userId=${userId} type=${type ?? 'none'} | ` +
        `ACCESS sessions=${sessions.length} | ` +
        `valid FCM tokens=${tokens.length} | ` +
        `Firebase initialized=${this.firebaseInitialized}`,
    );

    const imageUrl = this.resolveImageUrl(image);

    // Save in DB
    await this.prisma.notification.create({
      data: {
        title,
        body,
        image,
        type,
        resourceId,
        userId,
        clickTargetType: clickTarget?.targetType,
        clickStoreId: clickTarget?.storeId,
        clickCategoryId: clickTarget?.categoryId,
        clickServiceId: clickTarget?.serviceId,
        clickZoneId: clickTarget?.zoneId,
        clickOrderId: clickTarget?.orderId,
        clickCouponId: clickTarget?.couponId,
        clickUrl: clickTarget?.url,
        clickDeliveryId: clickTarget?.deliveryId ? String(clickTarget.deliveryId) : undefined,
      },
    });

    if (!tokens.length) {
      this.logger.warn(`[push] ⏭️ userId=${userId} — saved to DB, push skipped (no FCM tokens).`);
      return;
    }

    if (!this.firebaseInitialized || !admin.apps.length) {
      this.logger.error(`[push] ❌ userId=${userId} — Firebase Admin SDK not initialized. Push aborted.`);
      return;
    }

    const baseData = data ? data : resourceId ? { resourceId: `${resourceId}` } : undefined;

    const messageTemplate = this.buildNotificationMessage({
      title: localizedTitle,
      body: localizedBody,
      imageUrl,
      data: baseData,
      clickTarget,
    });

    // Multicast batching (Chunk into batches of <= 500)
    const BATCH_SIZE = 500;
    const tokenBatches = this.chunkArray(tokens, BATCH_SIZE);
    const staleTokens: string[] = [];

    this.metrics.totalAttempts += tokens.length;
    this.metrics.lastAttemptAt = new Date();

    for (let batchIndex = 0; batchIndex < tokenBatches.length; batchIndex++) {
      const batchTokens = tokenBatches[batchIndex];
      const batchMessage = {
        ...messageTemplate,
        tokens: batchTokens,
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(batchMessage);

        this.metrics.acceptedByFcm += response.successCount;
        this.metrics.failedAtFcm += response.failureCount;

        if (response.successCount > 0) this.metrics.lastSuccessAt = new Date();
        if (response.failureCount > 0) this.metrics.lastFailureAt = new Date();

        response.responses.forEach((r, i) => {
          const t = batchTokens[i];
          const tokenPrefix = t ? t.slice(0, 10) + '…' : 'unknown';

          if (r.success) {
            this.logger.log(`[push] ✅ ACCEPTED_BY_FCM batch#${batchIndex} token#${i} (${tokenPrefix}) userId=${userId}`);
          } else {
            const errCode = (r.error?.code || '').toLowerCase();
            const errMessage = (r.error?.message || '').toLowerCase();

            this.logger.error(
              `[push] ❌ FAILED_AT_FCM batch#${batchIndex} token#${i} (${tokenPrefix}) userId=${userId} ` +
                `code=${r.error?.code ?? 'unknown'} msg=${r.error?.message ?? ''}`,
            );

            if (
              errCode.includes('registration-token-not-registered') ||
              errCode.includes('invalid-registration-token') ||
              errCode.includes('mismatched-credential') ||
              errCode.includes('sender-id-mismatch') ||
              errCode.includes('not-registered') ||
              errMessage.includes('notregistered') ||
              errMessage.includes('invalidregistration') ||
              errMessage.includes('not registered')
            ) {
              if (t) staleTokens.push(t);
            }
          }
        });
      } catch (batchErr: any) {
        this.metrics.failedAtFcm += batchTokens.length;
        this.metrics.lastFailureAt = new Date();
        this.logger.error(`[push] ❌ Batch #${batchIndex} multicast error for userId=${userId}: ${batchErr.message}`);
      }
    }

    if (staleTokens.length > 0) {
      const uniqueStale = [...new Set(staleTokens)];
      await this.prisma.session.updateMany({
        where: { fcmToken: { in: uniqueStale } },
        data: { fcmToken: null },
      });
      this.metrics.invalidTokensCleaned += uniqueStale.length;
      this.logger.log(`[push-cleanup] 🧹 Cleaned up ${uniqueStale.length} stale/invalid FCM token(s) from DB for userId=${userId}`);
    }
  }

  async sendPushNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!token || !token.trim()) {
      this.logger.warn('sendPushNotification called with empty token — skipping');
      return;
    }

    if (!this.firebaseInitialized || !admin.apps.length) {
      throw new BadRequestException('Firebase Admin SDK is not initialized');
    }

    const message = {
      notification: { title, body },
      data,
      token,
      android: {
        priority: 'high' as const,
        notification: {
          sound: 'notification_sound',
          channelId: 'makank_orders_v2',
          priority: 'high' as const,
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'notification_sound.mp3' } },
      },
    };

    this.metrics.totalAttempts++;
    this.metrics.lastAttemptAt = new Date();

    try {
      const response = await admin.messaging().send(message);
      this.metrics.acceptedByFcm++;
      this.metrics.lastSuccessAt = new Date();
      this.logger.log(`[push-single] ✅ Single push accepted by FCM: ${response}`);
      return response;
    } catch (error: any) {
      this.metrics.failedAtFcm++;
      this.metrics.lastFailureAt = new Date();
      const errCode = (error?.code || '').toLowerCase();
      const errMessage = (error?.message || '').toLowerCase();

      if (
        errCode.includes('registration-token-not-registered') ||
        errCode.includes('invalid-registration-token') ||
        errCode.includes('not-registered') ||
        errMessage.includes('notregistered') ||
        errMessage.includes('invalidregistration') ||
        errMessage.includes('not registered')
      ) {
        await this.prisma.session.updateMany({
          where: { fcmToken: token },
          data: { fcmToken: null },
        });
        this.metrics.invalidTokensCleaned++;
        this.logger.log(`[push-cleanup] 🧹 Removed invalid FCM token: ${token.slice(0, 10)}…`);
      }
      this.logger.error(`[push-single] ❌ Error sending push notification: ${error.message}`);
      throw new BadRequestException('Failed to send push notification');
    }
  }

  async subscribeToTopic(fcmToken: string, topic: string) {
    if (!fcmToken || !topic) return;
    try {
      await admin.messaging().subscribeToTopic(fcmToken, topic);
      this.logger.log(`[push-topic] Subscribed token (${fcmToken.slice(0, 10)}…) to topic: ${topic}`);
    } catch (error: any) {
      this.logger.error(`[push-topic] Failed to subscribe to topic ${topic}: ${error.message}`);
      throw new Error(`Failed to subscribe to topic ${topic}: ${error.message}`);
    }
  }

  async sendToTopic(topic: string, title: string, body: string) {
    if (!this.firebaseInitialized || !admin.apps.length) {
      throw new BadRequestException('Firebase Admin SDK is not initialized');
    }

    const message = {
      notification: { title, body },
      topic,
      android: {
        priority: 'high' as const,
        notification: {
          sound: 'notification_sound',
          channelId: 'makank_orders_v2',
          priority: 'high' as const,
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'notification_sound.mp3' } },
      },
    };

    try {
      const response = await admin.messaging().send(message);
      this.logger.log(`[push-topic] ✅ Notification sent to ${topic} topic.`);
      return response;
    } catch (error: any) {
      this.logger.error(`[push-topic] ❌ Error sending topic notification: ${error.message}`);
      throw error;
    }
  }

  async sendNotification(
    locale: string | { languageId: string },
    data: SystemNotification,
    jti?: string,
    userId?: Id,
  ) {
    try {
      const { receiverKey, group } = data;
      const langStr = typeof locale === 'string' ? locale : locale?.languageId || 'ar';
      const title = localizedObject(data.title, langStr) as string;
      const body = localizedObject(data.body, langStr) as string;

      if (group) {
        await this.sendToTopic(receiverKey, title, body);
        await this.prisma.notification.create({
          data: {
            title: data.title,
            body: data.body,
            groupKey: receiverKey,
          },
        });
      } else {
        if (!jti) {
          this.logger.warn('sendNotification called without jti — skipping push');
          return;
        }

        const session = await this.prisma.session.findUnique({ where: { jti } });
        if (!session || !session.fcmToken) {
          this.logger.warn(`sendNotification: session or fcmToken not found for jti=${jti}`);
          return;
        }

        await this.sendPushNotification(session.fcmToken, title, body);

        await this.prisma.notification.create({
          data: {
            title: data.title,
            body: data.body,
            userId,
          },
        });
      }
    } catch (error: any) {
      this.logger.error(`Error sending notification: ${error.message}`);
    }
  }

  /**
   * Health Check API method (Audit #17)
   */
  async getHealthCheck() {
    const totalSessions = await this.prisma.session.count({ where: { type: SessionType.ACCESS } });
    const sessionsWithToken = await this.prisma.session.count({
      where: { type: SessionType.ACCESS, fcmToken: { not: null } },
    });
    const uniqueTokensResult = await this.prisma.session.findMany({
      where: { type: SessionType.ACCESS, fcmToken: { not: null } },
      select: { fcmToken: true },
      distinct: ['fcmToken'],
    });

    const acceptanceRate = this.metrics.totalAttempts > 0
      ? ((this.metrics.acceptedByFcm / this.metrics.totalAttempts) * 100).toFixed(2) + '%'
      : 'N/A';

    return {
      firebaseInitialized: this.firebaseInitialized,
      firebaseInitError: this.firebaseInitError || null,
      projectId: this.activeProjectId || null,
      totalAccessSessions: totalSessions,
      sessionsWithFcmToken: sessionsWithToken,
      uniqueFcmTokens: uniqueTokensResult.length,
      metrics: {
        ...this.metrics,
        fcmAcceptanceRate: acceptanceRate,
      },
    };
  }

  /**
   * Diagnostic helper — inspect user session & push readiness (Audit #18)
   */
  async diagnosePushForUser(userId: Id) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, type: SessionType.ACCESS },
      select: { fcmToken: true, languageId: true, ipAddress: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const tokens = [...new Set(sessions.map((s) => s.fcmToken).filter((t): t is string => Boolean(t)))];

    return {
      userId,
      firebaseInitialized: this.firebaseInitialized,
      projectId: this.activeProjectId || null,
      accessSessionsCount: sessions.length,
      fcmTokensCount: tokens.length,
      tokens: tokens.map((t) => ({
        length: t.length,
        prefix: t.slice(0, 12) + '…',
      })),
      sessions: sessions.map((s) => ({
        hasFcmToken: Boolean(s.fcmToken),
        tokenPrefix: s.fcmToken ? s.fcmToken.slice(0, 12) + '…' : null,
        lang: s.languageId,
        ip: s.ipAddress,
        createdAt: s.createdAt,
      })),
    };
  }
}
