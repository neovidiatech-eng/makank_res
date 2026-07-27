import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
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
import {
  CreateAdminNotificationDto,
  TargetType,
} from '../dto/create-admin-notification.dto';

// Bounded concurrency: notify this many users in parallel per chunk, then move
// to the next chunk. Never Promise.all over the entire recipient set.
const CHUNK_SIZE = 50;

@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async createAndSend(dto: CreateAdminNotificationDto) {
    // ALL is never the implicit default — an admin must choose it explicitly.
    // A missing targetType falls back to the safest role-scoped option (CUSTOMER).
    const targetType = dto.targetType || TargetType.CUSTOMER;
    const clickTarget = await this.validateClickTarget(dto);

    const history = await this.prisma.adminNotification.create({
      data: {
        title: dto.title,
        body: dto.body,
        image: dto.image,
        targetType: targetType,
        targetUserIds: dto.targetUserIds || [],
        storeId: dto.storeId,
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

    const users = await this.resolveRecipients(targetType, dto);
    const { sentCount, failedCount } = await this.dispatchChunked(
      users,
      dto.title,
      dto.body,
      dto.storeId,
      clickTarget,
      dto.image,
    );

    this.logger.log(
      `Admin notification ${history.id} (${targetType}): recipients=${users.length} sent=${sentCount} failed=${failedCount}`,
    );

    return {
      ...history,
      dispatch: { recipientCount: users.length, sentCount, failedCount },
    };
  }

  // Resolves recipients per target type. Safety filters (active, not-deleted,
  // allowNotification) are applied to EVERY branch so notifications never reach
  // inactive, soft-deleted, or opted-out users. Role scoping:
  //   ALL            → every role (explicit global announcement)
  //   CUSTOMER       → customers only
  //   STORE          → store users only (optionally narrowed to storeIds)
  //   DELIVERY       → drivers only
  //   SELECTED_USERS → the given ids, still subject to the safety filters
  private async resolveRecipients(
    targetType: TargetType,
    dto: CreateAdminNotificationDto,
  ): Promise<{ id: number }[]> {
    const safety: Prisma.UserWhereInput = {
      active: true,
      deletedAt: null,
      allowNotification: true,
    };

    switch (targetType) {
      case TargetType.ALL:
        return this.prisma.user.findMany({
          where: { ...safety },
          select: { id: true },
        });
      case TargetType.CUSTOMER:
        return this.prisma.user.findMany({
          where: { ...safety, roleKey: RolesKeys.CUSTOMER },
          select: { id: true },
        });
      case TargetType.STORE: {
        const where: Prisma.UserWhereInput = {
          ...safety,
          roleKey: RolesKeys.STORE,
        };
        // For STORE, targetUserIds carries storeIds (see DTO description).
        if (dto.targetUserIds && dto.targetUserIds.length > 0) {
          where.storeId = { in: dto.targetUserIds };
        }
        return this.prisma.user.findMany({ where, select: { id: true } });
      }
      case TargetType.DELIVERY:
        return this.prisma.user.findMany({
          where: { ...safety, roleKey: RolesKeys.DELIVERY },
          select: { id: true },
        });
      case TargetType.SELECTED_USERS:
        if (!dto.targetUserIds || dto.targetUserIds.length === 0) return [];
        return this.prisma.user.findMany({
          where: { ...safety, id: { in: dto.targetUserIds } },
          select: { id: true },
        });
      default:
        return [];
    }
  }

  // Sends in bounded chunks with per-user failure isolation, so one bad token
  // never aborts the batch. Each id is DB-sourced (always truthy) — the
  // falsy-userId guard in sendLocalizedNotification stays as a safety net.
  private async dispatchChunked(
    users: { id: number }[],
    title: { ar: string; en: string },
    body: { ar: string; en: string },
    storeId?: number,
    clickTarget?: NotificationClickTarget,
    image?: string,
  ) {
    const type = storeId ? NotificationType.STORE : NotificationType.ADMIN;
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < users.length; i += CHUNK_SIZE) {
      const chunk = users.slice(i, i + CHUNK_SIZE);

      // With an image attached, dispatch this chunk sequentially instead of
      // firing every send concurrently. Several simultaneous FCM sends that
      // all reference the same image URL were observed to intermittently
      // arrive without the image (text-only) — a single recipient never
      // reproduced it, only 2+ concurrent recipients did. Sequential sends
      // remove that concurrency entirely; plain text notifications (no
      // image, never reported this issue) keep the faster concurrent path.
      const results = image
        ? await this.sendSequentially(chunk, title, body, type, storeId, clickTarget, image)
        : await Promise.allSettled(
            chunk.map((user) =>
              this.notificationService.sendLocalizedNotification(
                user.id,
                title,
                body,
                undefined,
                type,
                storeId,
                clickTarget,
                image,
              ),
            ),
          );

      for (const result of results) {
        if (result.status === 'fulfilled') sentCount++;
        else {
          failedCount++;
          this.logger.error(`Admin notification send failed: ${result.reason}`);
        }
      }
    }

    return { sentCount, failedCount };
  }

  private async sendSequentially(
    users: { id: number }[],
    title: { ar: string; en: string },
    body: { ar: string; en: string },
    type: NotificationType,
    storeId: number | undefined,
    clickTarget: NotificationClickTarget | undefined,
    image: string,
  ): Promise<PromiseSettledResult<unknown>[]> {
    const results: PromiseSettledResult<unknown>[] = [];
    for (const user of users) {
      try {
        const value = await this.notificationService.sendLocalizedNotification(
          user.id,
          title,
          body,
          undefined,
          type,
          storeId,
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

  private async validateClickTarget(
    dto: CreateAdminNotificationDto,
  ): Promise<NotificationClickTarget | undefined> {
    if (!dto.clickTargetType) return undefined;

    switch (dto.clickTargetType) {
      case NotificationTargetType.GENERAL:
        return { targetType: dto.clickTargetType };
      case NotificationTargetType.SPECIAL_DRIVER:
        this.requireClickRef(dto.clickDeliveryId, 'clickDeliveryId');
        const isFlow = ['RESTAURANT', 'PURCHASE', 'ONLINE'].includes(String(dto.clickDeliveryId));
        if (!isFlow) {
          await this.ensureExists(
            'delivery',
            Number(dto.clickDeliveryId),
            'Invalid clickDeliveryId',
          );
        }
        return {
          targetType: dto.clickTargetType,
          deliveryId: dto.clickDeliveryId,
        };
      case NotificationTargetType.STORE:
        this.requireClickRef(dto.clickStoreId, 'clickStoreId');
        await this.ensureExists(
          'store',
          dto.clickStoreId!,
          'Invalid clickStoreId',
        );
        return {
          targetType: dto.clickTargetType,
          storeId: dto.clickStoreId,
        };
      case NotificationTargetType.CATEGORY: {
        this.requireClickRef(dto.clickCategoryId, 'clickCategoryId');
        // A category's store is derived from the category itself (its storeId is
        // nullable — template/global categories have none). When the admin also
        // supplies a clickStoreId it must match.
        const storeId = await this.resolveCategoryStore(dto);
        return {
          targetType: dto.clickTargetType,
          storeId: storeId ?? undefined,
          categoryId: dto.clickCategoryId,
        };
      }
      case NotificationTargetType.SERVICE: {
        this.requireClickRef(dto.clickServiceId, 'clickServiceId');
        // A service always belongs to a store (storeId is non-nullable), so the
        // store context is derived from the service — the admin never sends it.
        const service = await this.prisma.service.findFirst({
          where: { id: dto.clickServiceId, deletedAt: null },
          select: { id: true, storeId: true },
        });
        if (!service) throw new BadRequestException('Invalid clickServiceId');
        return {
          targetType: dto.clickTargetType,
          storeId: service.storeId,
          serviceId: dto.clickServiceId,
        };
      }
      case NotificationTargetType.ZONE:
        this.requireClickRef(dto.clickZoneId, 'clickZoneId');
        await this.ensureExists(
          'zone',
          dto.clickZoneId!,
          'Invalid clickZoneId',
        );
        return {
          targetType: dto.clickTargetType,
          zoneId: dto.clickZoneId,
        };
      case NotificationTargetType.ORDER:
        this.requireClickRef(dto.clickOrderId, 'clickOrderId');
        await this.ensureExists(
          'order',
          dto.clickOrderId!,
          'Invalid clickOrderId',
        );
        return {
          targetType: dto.clickTargetType,
          orderId: dto.clickOrderId,
        };
      case NotificationTargetType.COUPON:
        this.requireClickRef(dto.clickCouponId, 'clickCouponId');
        await this.ensureExists(
          'coupon',
          dto.clickCouponId!,
          'Invalid clickCouponId',
        );
        return {
          targetType: dto.clickTargetType,
          couponId: dto.clickCouponId,
        };
      case NotificationTargetType.EXTERNAL_URL:
        this.validateClickUrl(dto.clickUrl);
        return {
          targetType: dto.clickTargetType,
          url: dto.clickUrl,
        };
    }
  }

  private requireClickRef(value: number | string | undefined, field: string): void {
    if (value == null) {
      throw new BadRequestException(`${field} is required`);
    }
  }

  // Resolves (and validates) the store a CATEGORY click target points at. The
  // store is derived from the category, since a category's storeId is nullable
  // (template/global categories have none). Returns null for a store-less
  // category. If the admin also passed a clickStoreId it must match.
  private async resolveCategoryStore(
    dto: CreateAdminNotificationDto,
  ): Promise<number | null> {
    const category = await this.prisma.category.findFirst({
      where: { id: dto.clickCategoryId, deletedAt: null },
      select: { id: true, storeId: true },
    });
    if (!category) throw new BadRequestException('Invalid clickCategoryId');

    if (dto.clickStoreId != null && category.storeId !== dto.clickStoreId) {
      throw new BadRequestException(
        'Click category does not belong to the selected click store',
      );
    }
    return category.storeId;
  }

  private async ensureExists(
    model: 'store' | 'zone' | 'order' | 'coupon' | 'delivery',
    id: number,
    message: string,
  ): Promise<void> {
    let record: { id: number } | null;
    switch (model) {
      case 'store':
        record = await this.prisma.store.findFirst({
          where: { id, deletedAt: null },
          select: { id: true },
        });
        break;
      case 'zone':
        record = await this.prisma.zone.findFirst({
          where: { id, deletedAt: null },
          select: { id: true },
        });
        break;
      case 'order':
        record = await this.prisma.order.findFirst({
          where: { id },
          select: { id: true },
        });
        break;
      case 'coupon':
        record = await this.prisma.coupon.findFirst({
          where: { id, deletedAt: null },
          select: { id: true },
        });
        break;
      case 'delivery':
        record = await this.prisma.user.findFirst({
          where: { id, roleKey: RolesKeys.DELIVERY, deletedAt: null },
          select: { id: true },
        });
        break;
    }
    if (!record) throw new BadRequestException(message);
  }

  private validateClickUrl(url: string | undefined): void {
    if (!url) throw new BadRequestException('clickUrl is required');

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new BadRequestException('clickUrl must be http or https');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('clickUrl must be a valid URL');
    }
  }

  async findAll() {
    return this.prisma.adminNotification.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.adminNotification.findUnique({
      where: { id, deletedAt: null },
    });
  }

  async remove(id: number) {
    return this.prisma.adminNotification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async sendCouponNotification(storeId: number, couponCode: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) return;

    const title = {
      en: 'New Coupon!',
      ar: 'كوبون جديد!',
    };
    const body = {
      en: `Use code ${couponCode} to get a discount at ${store.name['en'] || 'the store'}`,
      ar: `استخدم كود ${couponCode} للحصول على خصم في المتجر`,
    };

    // Send to all customers who allow notifications, in bounded chunks.
    const customers = await this.prisma.user.findMany({
      where: {
        roleKey: RolesKeys.CUSTOMER,
        deletedAt: null,
        active: true,
        allowNotification: true,
      },
      select: { id: true },
    });

    await this.dispatchChunked(customers, title, body, storeId);
  }
}
