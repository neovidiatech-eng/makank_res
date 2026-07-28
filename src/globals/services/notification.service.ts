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
 * the file exists next to the project root.  Falls back to FIREBASE_PROJECT_ID
 * env var so local dev / CI can still override via .env.
 *
 * NOTE: google-services.json is the ANDROID CLIENT config — it does NOT
 * contain the service-account private_key or client_email needed by the Admin
 * SDK.  Those must still come from FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL
 * env vars (generated in Firebase Console → Project Settings → Service Accounts
 * → Generate new private key).
 */
function resolveFirebaseProjectId(): string | undefined {
  const envId = process.env.FIREBASE_PROJECT_ID;

  // Try to read project_id from google-services.json at repo root
  try {
    const filePath = path.resolve(process.cwd(), 'google-services.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as { project_info?: { project_id?: string } };
      const fileId = parsed?.project_info?.project_id;
      if (fileId) {
        // Warn if env var is set but disagrees with the file
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
  // Deep-link to a specific driver's profile (SPECIAL_DRIVER campaigns).
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

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (!admin.apps.length && env('NOTIFICATIONS')) {
      try {
        const projectId = resolveFirebaseProjectId();
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

        this.logger.log(
          `[firebase-init] Initializing Firebase — projectId=${projectId ?? 'MISSING'} ` +
            `clientEmail=${clientEmail ? clientEmail.slice(0, 20) + '…' : 'MISSING'} ` +
            `privateKey=${privateKey ? 'present (' + privateKey.length + ' chars)' : 'MISSING'}`,
        );

        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            privateKey,
            clientEmail,
          }),
        });

        this.logger.log('[firebase-init] ✅ Firebase Admin initialized successfully');
      } catch (err) {
        this.logger.error(`[firebase-init] ❌ Firebase initialization FAILED: ${err.message}`);
      }
    } else if (admin.apps.length) {
      this.logger.log('[firebase-init] Firebase already initialized — skipping');
    } else {
      this.logger.warn(
        '[firebase-init] ⚠️  NOTIFICATIONS env is falsy — Firebase NOT initialized. Push will be DB-only.',
      );
    }
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
    // Guard against a falsy recipient
    if (!userId) {
      this.logger.warn(
        'sendLocalizedNotification called without userId — skipping to avoid broadcast',
      );
      return;
    }
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        type: SessionType.ACCESS,
      },
      // A user can have more than one live ACCESS session (e.g. the same
      // phone getting a new IP on a network handover, or a stale session
      // generateToken() never deduped) — always prefer the most recently
      // created one so a leftover session with the wrong languageId is
      // never the one picked.
      orderBy: { createdAt: 'desc' },
      select: {
        fcmToken: true,
        languageId: true,
      },
    });
    const locale = sessions[0]?.languageId || 'ar';
    const pickLocalized = (value: { ar: string; en: string }): string => {
      const v = value as unknown as Record<string, string>;
      // `||` (not `??`) so a blank string in the target language — e.g. an
      // admin left the Arabic field empty — falls through to the other
      // language instead of sending an empty title/body.
      return v?.[locale] || v?.ar || v?.en || Object.values(v ?? {})[0] || '';
    };
    const localizedTitle = pickLocalized(title);
    const localizedBody = pickLocalized(body);
    const tokens: string[] = [
      ...new Set(
        sessions
          .map((session): string | null => session.fcmToken)
          .filter((token): token is string => Boolean(token)),
      ),
    ];

    // ── always-on push diagnostics ──────────────────────────────────────────
    this.logger.log(
      `[push] userId=${userId} type=${type ?? 'none'} | ` +
        `ACCESS sessions=${sessions.length} | ` +
        `tokens with FCM=${tokens.length} | ` +
        `Firebase apps=${admin.apps.length} (initialized=${admin.apps.length > 0})`,
    );

    if (sessions.length === 0) {
      this.logger.warn(
        `[push] ❌ userId=${userId} — no ACCESS sessions found. User may not be logged in.`,
      );
    } else if (tokens.length === 0) {
      this.logger.warn(
        `[push] ❌ userId=${userId} — ${sessions.length} session(s) found but NONE have an FCM token. ` +
          `Mobile app must send fcmToken on login / profile-update.`,
      );
    }
    // ───────────────────────────────────────────────────────────────────────

    // Normalize null → undefined: ValidateImage() returns null (not undefined)
    // when no file is uploaded, which would leak imageUrl: null into the FCM payload.
    let imageUrl: string | undefined = image ?? undefined;
    
    this.logger.log(`[push-image-debug] Incoming raw image: ${image === null ? 'null (explicit)' : image === undefined ? 'undefined' : `"${image}"`}`);

    if (imageUrl && !imageUrl.startsWith('http')) {
      const baseUrl = env('MAIN_URL') || 'https://mlk.alzikr-academy.com';
      this.logger.log(`[push-image-debug] Resolving relative path using MAIN_URL / baseUrl: "${baseUrl}"`);
      // Route through the same /api/media?media= endpoint every other client
      // (dashboard, mobile) uses to load uploaded images, instead of a bare
      // static path — this doesn't depend on the reverse proxy also forwarding
      // un-prefixed /uploads/* requests straight to the Node app.
      imageUrl = `${baseUrl.replace(/\/$/, '')}/api/media?media=${imageUrl.replace(/^\//, '')}`;
      this.logger.log(`[push-image-debug] Resolved absolute path: "${imageUrl}"`);
    }

    // FCM requires imageUrl to be a valid absolute HTTP(S) URL.
    // If the resolved URL is not valid (e.g. MAIN_URL misconfigured), skip the image
    // to avoid messaging/invalid-payload errors.
    if (imageUrl) {
      try {
        const parsed = new URL(imageUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          this.logger.warn(
            `[push-image-debug] ⚠️ imageUrl "${imageUrl}" is not http/https — dropping from FCM payload`,
          );
          imageUrl = undefined;
        } else {
          this.logger.log(`[push-image-debug] ✅ imageUrl "${imageUrl}" is a VALID http/https URL.`);
        }
      } catch {
        this.logger.warn(
          `[push-image-debug] ⚠️ imageUrl "${imageUrl}" is not a valid absolute URL — dropping from FCM payload`,
        );
        imageUrl = undefined;
      }
    } else {
      this.logger.log(`[push-image-debug] No image attached or resolved for FCM payload.`);
    }

    const clickTargetData = buildClickTargetData(clickTarget);
    const baseData = data
      ? data
      : resourceId
        ? { resourceId: `${resourceId}` }
        : undefined;
    const pushData =
      baseData || clickTargetData || imageUrl
        ? {
            ...(baseData ?? {}),
            ...(clickTargetData ?? {}),
            // Both keys are sent (not just `image`) since the already-published
            // mobile build reads the foreground/custom-banner image from
            // data.imageUrl specifically — this is additive, not a behavior
            // change: individual and mass notifications already shared this
            // exact same data-building code, image included, either way.
            ...(imageUrl ? { image: imageUrl, imageUrl } : {}),
          }
        : undefined;

    const message = {
      notification: {
        title: localizedTitle,
        body: localizedBody,
        ...(imageUrl ? { imageUrl } : {}),
      },
      data: pushData,
      tokens,
      android: {
        notification: {
          sound: 'notification_sound',
          channelId: 'makank_orders_v2',
          ...(imageUrl ? { imageUrl } : {}),
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification_sound.mp3',
            // mutableContent: true tells iOS the app extension can modify the
            // notification before display (needed to show remote images).
            // Do NOT also set 'mutable-content': 1 — the SDK maps mutableContent
            // to that key internally; both together cause duplicate-field rejection.
            ...(imageUrl ? { mutableContent: true } : {}),
          },
        },
        ...(imageUrl ? { fcmOptions: { imageUrl } } : {}),
      },
    };
    await this.prisma.notification.create({
      data: {
        title: title,
        body: body,
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
      this.logger.warn(
        `[push] ⏭️  userId=${userId} — notification saved to DB but push skipped (no tokens).`,
      );
      return;
    }

    if (!admin.apps.length) {
      this.logger.error(
        `[push] ❌ userId=${userId} — Firebase is NOT initialized (NOTIFICATIONS env may be falsy). Push aborted.`,
      );
      return;
    }

    try {
      const response = await admin.messaging().sendEachForMulticast(message);

      // Per-token result log — shows exactly which tokens succeeded/failed
      response.responses.forEach((r, i) => {
        if (r.success) {
          this.logger.log(
            `[push] ✅ SENT  token#${i} (prefix=${tokens[i]?.slice(0, 10)}…) userId=${userId}`,
          );
        } else {
          this.logger.error(
            `[push] ❌ FAILED token#${i} (prefix=${tokens[i]?.slice(0, 10)}…) userId=${userId} ` +
              `error=${r.error?.code ?? 'unknown'} message=${r.error?.message ?? ''}`,
          );
        }
      });

      this.logger.log(
        `[push] Summary userId=${userId}: ✅ success=${response.successCount} ❌ failure=${response.failureCount}`,
      );
      return response;
    } catch (error) {
      this.logger.error(
        `[push] ❌ sendEachForMulticast THREW for userId=${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Diagnostic helper — call this from any service/endpoint to get a full
   * snapshot of push readiness for a specific userId without actually sending.
   *
   * Example (temporary debugging in a controller):
   *   await this.notificationService.diagnosePushForUser(userId);
   */
  async diagnosePushForUser(userId: Id): Promise<void> {
    this.logger.log(`[push-diag] ══════ Diagnosing push for userId=${userId} ══════`);

    // 1. Firebase state
    this.logger.log(
      `[push-diag] Firebase apps initialized: ${admin.apps.length} ` +
        `(NOTIFICATIONS env=${env('NOTIFICATIONS')})`,
    );

    // 2. Sessions
    const sessions = await this.prisma.session.findMany({
      where: { userId, type: SessionType.ACCESS },
      select: { fcmToken: true, languageId: true, ipAddress: true, createdAt: true },
    });
    this.logger.log(`[push-diag] ACCESS sessions found: ${sessions.length}`);
    sessions.forEach((s, i) => {
      this.logger.log(
        `[push-diag]   session#${i}: ` +
          `fcmToken=${s.fcmToken ? 'present (' + s.fcmToken.length + ' chars, prefix=' + s.fcmToken.slice(0, 12) + '…)' : 'NULL ❌'} ` +
          `lang=${s.languageId} ip=${s.ipAddress} created=${s.createdAt?.toISOString()}`,
      );
    });

    // 3. Tokens summary
    const tokens = [...new Set(sessions.map((s) => s.fcmToken).filter(Boolean))];
    this.logger.log(
      `[push-diag] Unique valid FCM tokens: ${tokens.length} / ${sessions.length} sessions`,
    );

    this.logger.log(`[push-diag] ══════ End diagnosis for userId=${userId} ══════`);
  }

  async sendPushNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    const message = {
      notification: { title, body },
      data,
      token,
      android: {
        notification: {
          sound: 'notification_sound',
          channelId: 'makank_orders_v2',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification_sound.mp3',
          },
        },
      },
    };

    try {
      const response = await admin.messaging().send(message);
      this.logger.log(`Push notification sent: ${response}`);
      return response;
    } catch (error) {
      this.logger.error(`Error sending push notification: ${error.message}`);
      throw new BadRequestException('Failed to send push notification');
    }
  }

  async subscribeToTopic(fcmToken: string, topic: string) {
    try {
      await admin.messaging().subscribeToTopic(fcmToken, topic);
    } catch (error) {
      throw new Error(`Failed to subscribe to topic ${topic}: ${error}`);
    }
  }

  async sendToTopic(topic: string, title: string, body: string) {
    const message = {
      notification: { title, body },
      topic: topic,
      android: {
        notification: {
          sound: 'notification_sound',
          channelId: 'makank_orders_v2',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification_sound.mp3',
          },
        },
      },
    };

    try {
      const response = await admin.messaging().send(message);
      this.logger.log(`Notification sent to ${topic} topic.`);
      return response;
    } catch (error) {
      this.logger.error(`Error sending topic notification: ${error.message}`);
      throw error;
    }
  }

  async sendNotification(
    locale,
    data: SystemNotification,
    jti?: string,
    userId?: Id,
  ) {
    try {
      const { receiverKey, group } = data;
      const title = localizedObject(data.title, locale.languageId) as string;
      const body = localizedObject(data.body, locale.languageId) as string;
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
        const token = (await this.prisma.session.findUnique({ where: { jti } }))
          .fcmToken;
        await this.sendPushNotification(token, title, body);

        await this.prisma.notification.create({
          data: {
            title: data.title,
            body: data.body,
            userId,
          },
        });
      }
    } catch (error) {
      this.logger.error(`Error sending notification: ${error.message}`);
    }
  }
}
