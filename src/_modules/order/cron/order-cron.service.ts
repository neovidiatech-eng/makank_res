import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs/promises';
// import { OrderStatus } from '@prisma/client';
import { PrismaService } from 'src/globals/services/prisma.service'; // Start investigating where PrismaService is
import { OrderService } from '../order.service';

@Injectable()
export class OrderCronService {
  private readonly logger = new Logger(OrderCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
  ) {}

  // SCHEDULED orders sit in ArchivedOrder with no automatic wake-up otherwise —
  // POST /orders/archived/:id/realize only ever ran if something external called it.
  // This sweeps due ones (scheduledAt in the past) and realizes them one by one, so
  // a single bad order (stale coupon, insufficient wallet balance, etc.) doesn't
  // block the rest; it's left in ArchivedOrder to retry on the next tick.
  @Cron(CronExpression.EVERY_MINUTE)
  async realizeDueScheduledOrders() {
    const due = await this.prisma.archivedOrder.findMany({
      where: { scheduledAt: { not: null, lte: new Date() } },
      select: { id: true },
    });
    if (due.length === 0) return;

    for (const { id } of due) {
      try {
        await this.orderService.realizeArchivedOrder(id);
        this.logger.log(`Realized scheduled archived order ${id}.`);
      } catch (error) {
        this.logger.error(`Failed to realize archived order ${id}`, error);
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.debug('Running order cancellation cron job...');

    const now = new Date();

    // Logic: Date passed AND status is PENDING or PENDING_PAYMENT
    // Assuming 'date' related field is 'date' or maybe 'createdAt'.
    // The user said "date passed", so likely there is a 'date' field or 'scheduledAt'.
    // Looking at the schema i saw earlier:
    // date DateTime @default(now())
    // createdAt DateTime @default(now())

    // If the logical "date" of the order (e.g. appointment date) is in the past
    // and it's still pending, cancel it.

    try {
      await this.prisma.$connect();
      const result = await this.prisma.order.updateMany({
        where: {
          OR: [{ status: 'PENDING' }, { status: 'PENDING_PAYMENT' }],
          date: {
            lt: now,
          },
        },
        data: {
          status: 'CANCELLED',
        },
      });

      this.logger.log(`Cancelled ${result.count} expired orders.`);
    } catch (error) {
      this.logger.error('Error cancelling expired orders', error);
    }
  }

  // Reap custom-delivery station images that were uploaded but never attached to
  // an order (stationId still null) and are older than a day — the user abandoned
  // the order. Consumed images (stationId set) are untouched and cascade with
  // their station. Deletes the file then the row.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOrphanStationImages() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      const orphans = await this.prisma.orderStationImage.findMany({
        where: { stationId: null, createdAt: { lt: cutoff } },
        select: { id: true, image: true },
      });
      if (orphans.length === 0) return;

      await Promise.all(
        orphans.map(async (o) => {
          try {
            await fs.unlink(o.image);
          } catch (error: any) {
            if (error?.code !== 'ENOENT') {
              this.logger.warn(
                `Failed to unlink orphan image ${o.image}: ${error?.message}`,
              );
            }
          }
        }),
      );

      const { count } = await this.prisma.orderStationImage.deleteMany({
        where: { id: { in: orphans.map((o) => o.id) } },
      });
      this.logger.log(`Cleaned up ${count} orphan station images.`);
    } catch (error) {
      this.logger.error('Error cleaning up orphan station images', error);
    }
  }
}
