import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  egyptWallClockToTimeColumn,
  toEgyptParts,
} from 'src/globals/helpers/egypt-time.helper';
import { NotificationService } from 'src/globals/services/notification.service';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class DeliveryScheduleCronService {
  private readonly logger = new Logger(DeliveryScheduleCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendShiftReminders() {
    // Target = the Egypt wall-clock 30 minutes from now (DST-correct; handles
    // midnight/day rollover via the instant). Schedules store the literal Egypt
    // wall-clock (Option A), so we match that exact TIME and day.
    const target = toEgyptParts(new Date(Date.now() + 30 * 60 * 1000));
    const targetDay = target.dayOfWeek;
    const targetTimeNormalized = egyptWallClockToTimeColumn(
      target.hours,
      target.minutes,
    );

    this.logger.debug(
      `Checking shifts for ${targetDay} at ${target.hours}:${String(
        target.minutes,
      ).padStart(2, '0')}`,
    );

    await this.prisma.$connect();
    const upcomingSchedules = await this.prisma.deliverySchedule.findMany({
      where: {
        day: targetDay,
        openingTime: targetTimeNormalized,
      },
      include: {
        Delivery: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (upcomingSchedules.length === 0) {
      return;
    }

    this.logger.log(
      `Sending shift reminders to ${upcomingSchedules.length} delivery personnel`,
    );

    for (const schedule of upcomingSchedules) {
      try {
        await this.notificationService.sendLocalizedNotification(
          schedule.deliveryId,
          {
            ar: 'تذكير بالوردية',
            en: 'Shift Reminder',
          },
          {
            ar: 'موعد الوردية الخاصة بك سيبدأ بعد 30 دقيقة. يرجى الاستعداد.',
            en: 'Your scheduled shift starts in 30 minutes. Please be ready.',
          },
          {
            type: 'SHIFT_REMINDER',
            scheduleId: schedule.id.toString(),
          },
          'SHIFT_REMINDER' as any,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send shift reminder to user ${schedule.deliveryId}: ${error.message}`,
        );
      }
    }
  }
}
