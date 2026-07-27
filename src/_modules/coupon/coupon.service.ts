import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

import { firstOrMany } from 'src/globals/helpers/first-or-many';
import {
  CreateCouponDTO,
  FilterCouponDTO,
  UpdateCouponDTO,
} from './dto/coupon.dto';

import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from 'src/globals/services/notification.service';
import { AdminNotificationService } from '../admin-notification/services/admin-notification.service';
import { RolesKeys } from '../authorization/providers/roles';
import { LanguagesService } from '../languages/languages.service';
import {
  getCouponArgs,
  getCouponArgsWithSelect,
} from './prisma-args/coupon.prisma.args';

// Bounded concurrency for promotional coupon fan-out — never Promise.all over all customers.
const CHUNK_SIZE = 50;

@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly Language: LanguagesService,
    private readonly adminNotificationService: AdminNotificationService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(body: CreateCouponDTO) {
    const {
      userIds,
      storeIds,
      zoneIds,
      notificationTitle,
      notificationDescription,
      ...data
    } = body;
    const coupon = await this.prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.create({
        data: {
          ...data,
        },
      });
      if (storeIds?.length) {
        await tx.storeCoupons.createMany({
          data: storeIds.map((storeId) => {
            return {
              storeId,
              couponId: coupon.id,
            };
          }),
        });
      }
      if (userIds?.length) {
        await tx.userCoupons.createMany({
          data: userIds.map((userId) => {
            return {
              userId,
              couponId: coupon.id,
            };
          }),
        });
      }
      if (zoneIds?.length) {
        await tx.couponZones.createMany({
          data: zoneIds.map((zoneId) => {
            return {
              zoneId,
              couponId: coupon.id,
            };
          }),
        });
      }
      return coupon;
    });

    // Notifications run AFTER the transaction commits, so FCM fan-out never
    // holds the DB transaction open and nothing is sent if the write rolled back.
    try {
      if (storeIds?.length) {
        for (const storeId of storeIds) {
          await this.adminNotificationService.sendCouponNotification(
            storeId,
            coupon.code,
          );
        }
      }
      if (notificationTitle && notificationDescription) {
        const notificationType =
          body.type === 'STORE_WISE' && storeIds?.length ? 'STORE' : 'COUPON';
        const resourceId =
          notificationType === 'STORE' ? storeIds[0] : undefined;
        await this.notifyCustomers(
          notificationTitle,
          notificationDescription,
          notificationType,
          resourceId,
        );
      }
    } catch (error) {
      // A coupon must still be created even if notification dispatch fails.
      this.logger.error(
        `Coupon ${coupon.id} notification failed: ${error?.message}`,
      );
    }
  }

  async update(id: Id, body: UpdateCouponDTO) {
    const {
      userIds,
      storeIds,
      zoneIds,
      notificationTitle,
      notificationDescription,
      ...data
    } = body;

    const coupon = await this.prisma.$transaction(async (tx) => {
      // ✅ Step 1 — Update coupon main fields
      const coupon = await tx.coupon.update({
        where: { id },
        data: data as any,
      });

      // ✅ Step 2 — Handle Store Relation
      // If storeId exists → ensure it is the only related store
      await tx.storeCoupons.deleteMany({ where: { couponId: id } });

      if (storeIds) {
        await tx.storeCoupons.createMany({
          data: storeIds.map((storeId) => ({ storeId, couponId: id })),
        });
      }
      await tx.userCoupons.deleteMany({ where: { couponId: id } });

      // ✅ Step 3 — Handle User Relation
      if (userIds) {
        await tx.userCoupons.createMany({
          data: userIds.map((userId) => ({ userId, couponId: id })),
        });
      }
      // Zone restriction — explicit semantics: omitted (undefined) keeps the
      // existing zones untouched; [] clears all restrictions (coupon becomes
      // global); a non-empty array replaces the allowed zones.
      if (zoneIds !== undefined) {
        await tx.couponZones.deleteMany({ where: { couponId: id } });
        if (zoneIds.length) {
          await tx.couponZones.createMany({
            data: zoneIds.map((zoneId) => ({ zoneId, couponId: id })),
          });
        }
      }

      return coupon;
    });

    // Customer notifications run AFTER the transaction commits (reads use the
    // committed state via this.prisma, not the tx client).
    if (notificationTitle && notificationDescription) {
      try {
        const notificationType =
          (body.type || coupon.type) === 'STORE_WISE' &&
          (storeIds?.length ||
            (await this.prisma.storeCoupons.count({ where: { couponId: id } })))
            ? 'STORE'
            : 'COUPON';

        let resourceId: number | undefined;
        if (notificationType === 'STORE') {
          if (storeIds?.length) {
            resourceId = storeIds[0];
          } else {
            const relatedStore = await this.prisma.storeCoupons.findFirst({
              where: { couponId: id },
            });
            resourceId = relatedStore?.storeId;
          }
        }

        await this.notifyCustomers(
          notificationTitle,
          notificationDescription,
          notificationType,
          resourceId,
        );
      } catch (error) {
        this.logger.error(
          `Coupon ${id} notification failed: ${error?.message}`,
        );
      }
    }

    return coupon;
  }

  // Resolves real CUSTOMER users (roleKey 'Customer' — not the previous, never-
  // matching 'CUSTOMER') who allow notifications, and sends in bounded chunks.
  // Promotional, so active/deletedAt/allowNotification are all enforced.
  private async notifyCustomers(
    title: any,
    description: any,
    type: 'STORE' | 'COUPON',
    resourceId?: number,
  ) {
    const customers = await this.prisma.user.findMany({
      where: {
        roleKey: RolesKeys.CUSTOMER,
        deletedAt: null,
        active: true,
        allowNotification: true,
      },
      select: { id: true },
    });

    for (let i = 0; i < customers.length; i += CHUNK_SIZE) {
      const chunk = customers.slice(i, i + CHUNK_SIZE);
      await Promise.allSettled(
        chunk.map((user) =>
          this.notificationService.sendLocalizedNotification(
            user.id,
            title,
            description,
            undefined,
            type as any,
            resourceId,
          ),
        ),
      );
    }
  }

  async findAll(filters: FilterCouponDTO) {
    const languages = await this.Language.getCashedLanguages();
    const args = getCouponArgs(filters, languages);
    const argsWithSelect = getCouponArgsWithSelect(filters?.id);

    const data = await this.prisma.coupon[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });
    return data;
  }

  async count(filters: FilterCouponDTO) {
    const languages = await this.Language.getCashedLanguages();
    const args = getCouponArgs(filters, languages);
    const total = await this.prisma.coupon.count({ where: args.where });

    return total;
  }

  async delete(id: Id): Promise<void> {
    await this.prisma.coupon.delete({
      where: {
        id,
      },
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expiredCoupons() {
    await this.prisma.$connect();
    const coupons = await this.prisma.coupon.updateMany({
      where: {
        endDate: {
          lte: new Date(),
        },
      },
      data: {
        expired: true,
        active: false,
      },
    });

    return coupons;
  }
}
