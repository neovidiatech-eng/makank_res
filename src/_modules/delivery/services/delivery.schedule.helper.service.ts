import { BadRequestException, Injectable } from '@nestjs/common';
import { SCHEDULE_ERRORS } from 'src/_modules/store/config/schedule.config';
import {
  egyptNowParts,
  egyptWallClockToMinutes,
  timeColumnToMinutes,
} from 'src/globals/helpers/egypt-time.helper';
import { PrismaService } from 'src/globals/services/prisma.service';
import { DeliveryAvailabilityService } from '../delivery-availability.service';
import { CreateDeliveryScheduleDTO } from '../dto/delivery.dto';

@Injectable()
export class DeliveryScheduleHelpersService {
  constructor(private readonly prisma: PrismaService) {}

  async syncDeliveryAvailability(deliveryId: number): Promise<boolean> {
    const np = egyptNowParts();
    const today = np.dayOfWeek;
    const currentTimeInSeconds = np.secondsOfDay;

    const details = await this.prisma.deliveryDetails.findUnique({
      where: { userId: deliveryId },
      include: {
        Schedule: {
          where: { day: today },
          select: { openingTime: true, closingTime: true },
        },
      },
    });

    if (!details) return false;
    if (details.forceAvailable) {
      if (details.availableNow === false) {
        await this.prisma.deliveryDetails.update({
          where: { userId: deliveryId },
          data: { availableNow: true },
        });
      }
      return true;
    }

    // Single source of truth: the same shift-window check the availability cron
    // uses. Schedule TIME columns hold the literal Egypt wall-clock (Option A).
    const isAvailable = DeliveryAvailabilityService.isWithinShift(
      details.Schedule,
      currentTimeInSeconds,
    );

    if (details.availableNow !== isAvailable) {
      await this.prisma.deliveryDetails.update({
        where: { userId: deliveryId },
        data: { availableNow: isAvailable },
      });
    }

    return isAvailable;
  }

  async scheduleOverlap(
    deliveryId: number,
    body: CreateDeliveryScheduleDTO,
  ): Promise<void> {
    // Incoming DTO times are Egypt wall-clock "HH:mm"; compare on the same zero-offset
    // basis the stored rows use (Option A).
    const openMinutes = egyptWallClockToMinutes(body.openingTime);
    const closeMinutes = egyptWallClockToMinutes(body.closingTime);

    if (closeMinutes <= openMinutes) {
      throw new BadRequestException(SCHEDULE_ERRORS.INVALID_SCHEDULE);
    }

    const existingSchedules = await this.prisma.deliverySchedule.findMany({
      where: {
        deliveryId,
        day: body.day,
      },
    });

    for (const schedule of existingSchedules) {
      const sOpenMinutes = timeColumnToMinutes(schedule.openingTime);
      const sCloseMinutes = timeColumnToMinutes(schedule.closingTime);

      // Check for overlap: max(start1, start2) < min(end1, end2)
      if (
        Math.max(openMinutes, sOpenMinutes) <
        Math.min(closeMinutes, sCloseMinutes)
      ) {
        throw new BadRequestException(SCHEDULE_ERRORS.OVERLAPPING_SCHEDULE);
      }
    }
  }
}
