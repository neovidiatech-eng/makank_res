import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AssignmentStatus } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { NotificationService } from 'src/globals/services/notification.service';
import { PrismaService } from 'src/globals/services/prisma.service';
import { OrderService } from '../order.service';
import { AssignmentService } from './assignment.service';

@Injectable()
export class AssignmentTimerService {
  private readonly logger = new Logger(AssignmentTimerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    private readonly assignmentService: AssignmentService,
  ) {}

  // Picks up orders whose store-acceptance delay (assignmentReadyAt, set in
  // OrderService.changeStatus's PREPARING branch — AUTO mode only) has elapsed,
  // and only now starts the driver search. Mirrors checkTimedOutAssignments'
  // cron+timestamp pattern rather than a new scheduling primitive.
  @Cron(CronExpression.EVERY_MINUTE)
  async checkPendingAutoAssignments() {
    const now = new Date();
    const dueOrders = await this.prisma.order.findMany({
      where: {
        assignmentReadyAt: { lte: now },
        deliveryId: null,
      },
      select: { id: true },
    });

    for (const { id: orderId } of dueOrders) {
      try {
        // Clear first so a slow assignment run (or a crash mid-loop) can't cause
        // this order to be picked up again by next minute's tick.
        await this.prisma.order.update({
          where: { id: orderId },
          data: { assignmentReadyAt: null },
        });
        await this.assignmentService.handleOrderAssignment(orderId);
      } catch (error) {
        this.logger.error(
          `Failed scheduled auto-assignment for order ${orderId}: ${error?.message}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkTimedOutAssignments() {
    const now = new Date();
    await this.prisma.$connect();

    const timedOut = await this.prisma.orderDeliveryAssignment.findMany({
      where: {
        status: AssignmentStatus.PENDING,
        expiresAt: { lt: now },
      },
      include: {
        Order: true,
        Delivery: {
          include: { User: true },
        },
      },
    });

    for (const assignment of timedOut) {
      await this.prisma.$transaction(async (tx) => {
        await tx.orderDeliveryAssignment.update({
          where: { id: assignment.id },
          data: { status: AssignmentStatus.TIMEOUT },
        });

        // Notify Admin — roleKey is stored as RolesKeys.ADMIN ('Admin'); the
        // previous hardcoded 'ADMIN' matched no rows, so admins were never alerted.
        const adminUsers = await tx.user.findMany({
          where: { roleKey: RolesKeys.ADMIN },
        });

        for (const admin of adminUsers) {
          await this.notificationService.sendLocalizedNotification(
            admin.id,
            {
              ar: 'تنبيه: عدم رد الديلفري',
              en: 'Alert: Delivery Person No Response',
            },
            {
              ar: `الديلفري ${assignment.Delivery.User.name} لم يقم بالرد على الطلب رقم ${assignment.orderId}`,
              en: `Delivery ${assignment.Delivery.User.name} did not respond to order ${assignment.orderId}`,
            },
            { resourceId: `${assignment.orderId}`, type: 'DELIVERY_TIMEOUT' },
          );
        }
      });

      this.logger.log(
        `Assignment ${assignment.id} timed out for order ${assignment.orderId}`,
      );
    }

    // Punish drivers who ignored their assignment(s): one break/pending per driver per run.
    const distinctDrivers = new Map<number, string>();
    for (const assignment of timedOut) {
      if (!distinctDrivers.has(assignment.deliveryId)) {
        distinctDrivers.set(
          assignment.deliveryId,
          assignment.Delivery?.User?.name ?? '',
        );
      }
    }

    for (const [deliveryId, userName] of distinctDrivers) {
      try {
        await this.orderService.applyOrDeferAfkBreak(deliveryId, userName);
      } catch (error) {
        this.logger.error(
          `Failed to apply AFK break for driver ${deliveryId}: ${error?.message}`,
        );
      }
    }

    // Re-assign each timed-out order to the next-nearest available driver. Runs
    // after the AFK breaks so benched drivers are excluded, and skips the driver
    // who just let the order lapse.
    for (const assignment of timedOut) {
      try {
        await this.orderService.reassignAfterTimeout(
          assignment.orderId,
          assignment.deliveryId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to re-assign order ${assignment.orderId} after timeout: ${error?.message}`,
        );
      }
    }
  }
}
