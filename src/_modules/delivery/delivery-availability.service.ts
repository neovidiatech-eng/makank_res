import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Days } from '@prisma/client';
import {
  egyptNowParts,
  isWithinWindow,
  timeColumnToSeconds,
} from 'src/globals/helpers/egypt-time.helper';
import { AfkBreakService } from 'src/globals/services/afk-break.service';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class DeliveryAvailabilityService {
  private readonly logger = new Logger(DeliveryAvailabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly afkBreakService: AfkBreakService,
  ) {}

  static readonly WEEK_DAYS = [
    Days.SUNDAY,
    Days.MONDAY,
    Days.TUESDAY,
    Days.WEDNESDAY,
    Days.THURSDAY,
    Days.FRIDAY,
    Days.SATURDAY,
  ];

  /**
   * Shared shift-window check used by both the availability cron and the AFK
   * resume cron, so the two stay in lockstep. `schedules` are the driver's
   * schedule rows for the current day; `currentTimeInSeconds` is the Cairo
   * seconds-of-day (see egyptNowParts). Schedule TIME columns hold the literal
   * Egypt wall-clock (Option A), so they are read with zero offset.
   */
  static isWithinShift(
    schedules: { openingTime: Date; closingTime: Date }[],
    currentTimeInSeconds: number,
  ): boolean {
    return schedules.some((schedule) =>
      isWithinWindow(
        timeColumnToSeconds(schedule.openingTime),
        timeColumnToSeconds(schedule.closingTime),
        currentTimeInSeconds,
      ),
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkAvailability() {
    this.logger.log('Checking delivery personnel availability...');

    const np = egyptNowParts();
    const today = np.dayOfWeek;
    const currentTimeInSeconds = np.secondsOfDay;
    await this.prisma.$connect();

    // Get all delivery details with their schedule for today
    const deliveryDetails = await this.prisma.deliveryDetails.findMany({
      include: {
        Schedule: {
          where: { day: today },
        },
      },
    });

    for (const details of deliveryDetails) {
      // Honor an active forced AFK break: keep the driver offline and skip both
      // the forceAvailable re-enable and the schedule logic.
      if (await this.afkBreakService.isOnBreak(details.userId)) {
        if (details.availableNow === true) {
          await this.prisma.deliveryDetails.update({
            where: { userId: details.userId },
            data: { availableNow: false },
          });
        }
        continue;
      }

      if (details.forceAvailable) {
        if (details.availableNow === false) {
          await this.prisma.deliveryDetails.update({
            where: { userId: details.userId },
            data: { availableNow: true },
          });
        }
        continue;
      }

      const isAvailable = DeliveryAvailabilityService.isWithinShift(
        details.Schedule,
        currentTimeInSeconds,
      );

      // Bring drivers both ONLINE and OFFLINE from their schedule. The
      // forceAvailable / on-break guards above already short-circuit, so this is
      // safe. (Previously this only ever set OFFLINE, leaving schedule-based
      // onlining dead.)
      if (details.availableNow !== isAvailable) {
        await this.prisma.deliveryDetails.update({
          where: { userId: details.userId },
          data: { availableNow: isAvailable },
        });
        this.logger.log(
          `Updated availability for delivery ${details.userId}: ${isAvailable}`,
        );
      }
    }
  }
}
