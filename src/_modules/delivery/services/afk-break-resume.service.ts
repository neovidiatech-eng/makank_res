import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { egyptNowParts } from 'src/globals/helpers/egypt-time.helper';
import { AfkBreakService } from 'src/globals/services/afk-break.service';
import { NotificationService } from 'src/globals/services/notification.service';
import { PrismaService } from 'src/globals/services/prisma.service';
import { DeliveryAvailabilityService } from '../delivery-availability.service';

@Injectable()
export class AfkBreakResumeService {
  private readonly logger = new Logger(AfkBreakResumeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly afkBreakService: AfkBreakService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async resumeDueBreaks() {
    const due = await this.afkBreakService.getDueBreaks();
    if (due.length === 0) return;

    const np = egyptNowParts();
    const today = np.dayOfWeek;
    const currentTimeInSeconds = np.secondsOfDay;

    for (const driverId of due) {
      try {
        const details = await this.prisma.deliveryDetails.findUnique({
          where: { userId: driverId },
          include: {
            Schedule: {
              where: { day: today },
            },
          },
        });

        if (details) {
          const withinShift =
            details.forceAvailable ||
            DeliveryAvailabilityService.isWithinShift(
              details.Schedule,
              currentTimeInSeconds,
            );

          if (withinShift && details.availableNow === false) {
            await this.prisma.deliveryDetails.update({
              where: { userId: driverId },
              data: { availableNow: true },
            });

            await this.notificationService.sendLocalizedNotification(
              driverId,
              { ar: 'انتهت الاستراحة', en: 'Break Over' },
              {
                ar: 'انتهت استراحتك وأنت الآن متاح مرة أخرى.',
                en: 'Your break is over, you are back online.',
              },
              { type: 'AFK_BREAK_ENDED' },
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to resume driver ${driverId}: ${error?.message}`,
        );
      } finally {
        await this.afkBreakService.clearBreak(driverId);
      }
    }
  }
}
