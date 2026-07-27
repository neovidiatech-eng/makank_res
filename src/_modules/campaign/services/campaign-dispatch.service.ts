import { Injectable, Logger } from '@nestjs/common';
import {
  Campaign,
  CampaignTargetType,
  CampaignType,
  NotificationTargetType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import {
  NotificationClickTarget,
  NotificationService,
} from 'src/globals/services/notification.service';
import { PrismaService } from 'src/globals/services/prisma.service';

export interface CampaignDispatchResult {
  dispatched: boolean; // true when a send pass actually ran
  reason?: 'not-notification' | 'already-sent' | 'no-recipients';
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}

// Bounded concurrency: send to this many customers in parallel per chunk, then
// move to the next chunk. Never Promise.all over the entire recipient set.
const CHUNK_SIZE = 50;

@Injectable()
export class CampaignDispatchService {
  private readonly logger = new Logger(CampaignDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  // Dispatches a NOTIFICATION campaign to CUSTOMER recipients exactly once.
  // OFFER campaigns are never dispatched here. Idempotent via `sentAt`.
  async dispatchForCampaign(campaignId: Id): Promise<CampaignDispatchResult> {
    const empty = { recipientCount: 0, sentCount: 0, failedCount: 0 };

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    // Only NOTIFICATION campaigns send push. OFFER popups must never notify.
    if (!campaign || campaign.type !== CampaignType.NOTIFICATION) {
      return { dispatched: false, reason: 'not-notification', ...empty };
    }

    // Double-send protection: a campaign that already has sentAt is never re-sent.
    if (campaign.sentAt) {
      return { dispatched: false, reason: 'already-sent', ...empty };
    }

    const recipients = await this.resolveCustomerRecipients(campaign);

    // Zero recipients is not an error: the campaign persists, nothing is sent,
    // and we do NOT stamp sentAt (no send pass occurred).
    if (recipients.length === 0) {
      this.logger.warn(
        `Campaign ${campaign.id}: 0 eligible customer recipients — nothing sent`,
      );
      return { dispatched: false, reason: 'no-recipients', ...empty };
    }

    const { sentCount, failedCount } = await this.fanOut(campaign, recipients);

    // Stamp sentAt after the send pass so it can never be dispatched twice.
    await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { sentAt: new Date() },
    });

    this.logger.log(
      `Campaign ${campaign.id} dispatched: recipients=${recipients.length} sent=${sentCount} failed=${failedCount}`,
    );

    return {
      dispatched: true,
      recipientCount: recipients.length,
      sentCount,
      failedCount,
    };
  }

  // Resolves recipients as CUSTOMER users ONLY. Drivers, admins and store users
  // can never be included — the base filter is non-negotiable. STORE/SERVICE
  // target types are context metadata in v1 and do not narrow the audience.
  private async resolveCustomerRecipients(campaign: Campaign) {
    const base: Prisma.UserWhereInput = {
      roleKey: RolesKeys.CUSTOMER,
      active: true,
      deletedAt: null,
      allowNotification: true,
    };

    if (campaign.targetType === 'SELECTED_USERS') {
      const ids = Array.isArray(campaign.targetUserIds)
        ? (campaign.targetUserIds as number[]).filter(
            (n) => typeof n === 'number',
          )
        : [];
      if (ids.length === 0) return [];
      // Intersect the selected ids with the customer-only base filter, so any
      // non-customer id supplied by an admin is silently dropped.
      return this.prisma.user.findMany({
        where: { ...base, id: { in: ids } },
        select: { id: true },
      });
    }

    // ALL, CUSTOMER, STORE, SERVICE → every eligible customer.
    return this.prisma.user.findMany({
      where: base,
      select: { id: true },
    });
  }

  private async fanOut(campaign: Campaign, recipients: { id: number }[]) {
    const title = campaign.title as { ar: string; en: string };
    const body = campaign.description as { ar: string; en: string };

    // Build the click-target deep-link from campaign metadata so the mobile app
    // knows which screen to open when the user taps the notification.
    const clickTarget = this.buildClickTarget(campaign);

    let sentCount = 0;
    let failedCount = 0;
    const image = campaign.image ?? undefined;

    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + CHUNK_SIZE);

      // With an image attached, dispatch sequentially instead of firing every
      // send concurrently — see the matching comment in
      // AdminNotificationService.dispatchChunked for why (2+ simultaneous FCM
      // sends referencing the same image URL intermittently arrived text-only).
      const results = image
        ? await this.sendSequentially(chunk, title, body, clickTarget, image)
        : await Promise.allSettled(
            chunk.map((user) =>
              // Each id comes from the DB, so it is always truthy — the falsy-userId
              // guard in sendLocalizedNotification is never relied on to fix a bad call.
              this.notification.sendLocalizedNotification(
                user.id,
                title,
                body,
                undefined,
                NotificationType.ADMIN,
                undefined,
                clickTarget,
                image,
              ),
            ),
          );

      for (const result of results) {
        if (result.status === 'fulfilled') sentCount++;
        else {
          failedCount++;
          this.logger.error(
            `Campaign ${campaign.id}: send failed — ${result.reason}`,
          );
        }
      }
    }

    return { sentCount, failedCount };
  }

  private async sendSequentially(
    users: { id: number }[],
    title: { ar: string; en: string },
    body: { ar: string; en: string },
    clickTarget: NotificationClickTarget | undefined,
    image: string,
  ): Promise<PromiseSettledResult<unknown>[]> {
    const results: PromiseSettledResult<unknown>[] = [];
    for (const user of users) {
      try {
        const value = await this.notification.sendLocalizedNotification(
          user.id,
          title,
          body,
          undefined,
          NotificationType.ADMIN,
          undefined,
          clickTarget,
          image,
        );
        results.push({ status: 'fulfilled', value });
      } catch (reason) {
        results.push({ status: 'rejected', reason });
      }
    }
    return results;
  }

  /**
   * Builds a NotificationClickTarget from campaign metadata.
   * - STORE  targetType  → open the linked store
   * - SERVICE targetType → open the linked service
   * - SPECIAL_DRIVER     → open the linked driver profile
   * - Everything else   → GENERAL (no deep-link, notification-inbox only)
   */
  private buildClickTarget(
    campaign: Campaign,
  ): NotificationClickTarget | undefined {
    if (campaign.targetType === CampaignTargetType.STORE && campaign.storeId) {
      return {
        targetType: NotificationTargetType.STORE,
        storeId: campaign.storeId,
      };
    }
    if (
      campaign.targetType === CampaignTargetType.SERVICE &&
      campaign.serviceId
    ) {
      return {
        targetType: NotificationTargetType.SERVICE,
        serviceId: campaign.serviceId,
      };
    }
    if (
      campaign.targetType === CampaignTargetType.SPECIAL_DRIVER &&
      (campaign as any).deliveryId
    ) {
      return {
        targetType: NotificationTargetType.SPECIAL_DRIVER,
        deliveryId: (campaign as any).deliveryId,
      };
    }
    return undefined;
  }
}
