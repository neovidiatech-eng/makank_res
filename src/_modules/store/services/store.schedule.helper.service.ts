import { BadRequestException, Injectable } from '@nestjs/common';
import {
  egyptNowParts,
  egyptWallClockToMinutes,
  isBranchOpenBySchedule,
  timeColumnToMinutes,
  WEEK_DAYS,
} from 'src/globals/helpers/egypt-time.helper';
import { PrismaService } from 'src/globals/services/prisma.service';
import { SCHEDULE_ERRORS } from '../config/schedule.config';
import { CreateScheduleDTO } from '../dto/store.schedule.dto';

@Injectable()
export class ScheduleHelpersService {
  constructor(private readonly prisma: PrismaService) {}

  async syncBranchOpenStatus(branchId: Id): Promise<boolean> {
    const np = egyptNowParts();
    const today = np.dayOfWeek;
    // Also fetch yesterday's row — an overnight window posted under
    // yesterday (e.g. Friday 20:00→02:00) can still be open right now even
    // though the calendar day has already rolled over (see
    // isBranchOpenBySchedule's doc comment).
    const yesterday = WEEK_DAYS[(np.dayIndex + 6) % 7];
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        closed: true,
        temporarilyClosed: true,
        status: true,
        busyUntil: true,
        storeSchedule: {
          where: { day: { in: [today, yesterday] } },
          select: { day: true, openingTime: true, closingTime: true },
        },
      },
    });

    if (!branch) return false;

    // Check status priority first
    let currentStatus = branch.status || 'OPEN';
    if (currentStatus === 'BUSY' && branch.busyUntil) {
      if (new Date() > new Date(branch.busyUntil)) {
        currentStatus = 'OPEN';
      }
    }

    if (currentStatus === 'CLOSED') {
      if (!branch.closed) {
        await this.prisma.branch.update({
          where: { id: branchId },
          data: { closed: true },
        });
      }
      return false;
    }

    if (currentStatus === 'OPEN' || currentStatus === 'BUSY') {
      if (branch.closed) {
        await this.prisma.branch.update({
          where: { id: branchId },
          data: { closed: false },
        });
      }
      return true;
    }

    // Schedule TIME columns hold the literal Egypt wall-clock (Option A), so they
    // are read with zero offset and compared against the Egypt current minutes.
    const isOpenNow =
      !branch.temporarilyClosed &&
      isBranchOpenBySchedule(branch.storeSchedule, np);

    if (branch.closed === !isOpenNow) {
      return isOpenNow;
    }
    await this.prisma.branch.update({
      where: { id: branchId },
      data: { closed: !isOpenNow },
    });

    return isOpenNow;
  }

  async scheduleOverlap(branchId: Id, body: CreateScheduleDTO): Promise<void> {
    // Incoming DTO times are Egypt wall-clock "HH:mm"; compare on the same zero-offset
    // basis the stored rows use (Option A). This keeps validation and the runtime
    // open-check on one wall-clock (they previously disagreed, +2 vs +3).
    const openMinutes = egyptWallClockToMinutes(body.openingTime);
    const closeMinutes = egyptWallClockToMinutes(body.closingTime);

    if (closeMinutes <= openMinutes) {
      throw new BadRequestException(SCHEDULE_ERRORS.INVALID_SCHEDULE);
    }

    const existingSchedules = await this.prisma.storeSchedule.findMany({
      where: {
        branchId,
        day: body.day,
      },
    });

    for (const schedule of existingSchedules) {
      const sOpenMinutes = timeColumnToMinutes(schedule.openingTime);
      const sCloseMinutes = timeColumnToMinutes(schedule.closingTime);

      if (
        Math.max(openMinutes, sOpenMinutes) <
        Math.min(closeMinutes, sCloseMinutes)
      ) {
        throw new BadRequestException(SCHEDULE_ERRORS.OVERLAPPING_SCHEDULE);
      }
    }
  }
}
