import { Injectable } from '@nestjs/common';
import { StoreSchedule, Days } from '@prisma/client';
import { egyptWallClockToTimeColumn } from 'src/globals/helpers/egypt-time.helper';
import { PrismaService } from 'src/globals/services/prisma.service';
import {
  CreateScheduleDTO,
  UpdateStoreScheduleDTO,
} from '../dto/store.schedule.dto';
import { ScheduleHelpersService } from './store.schedule.helper.service';

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helpers: ScheduleHelpersService,
  ) {}

  async updateSchedules(branchId: number, data: UpdateStoreScheduleDTO) {
    const schedules = data.schedules || [];

    const schedulesToInsert = [];
    for (const s of schedules) {
      // Support both mobile format (dayOfWeek, openTime, closeTime) and standard DTO format (day, openingTime, closingTime)
      const day = (s as any).dayOfWeek || s.day;
      const rawOpen = (s as any).openTime || s.openingTime;
      const rawClose = (s as any).closeTime || s.closingTime;
      const isOpen = (s as any).isOpen !== undefined ? (s as any).isOpen : true;

      // If isOpen is explicitly false, we don't insert a schedule for this day (meaning it's closed)
      if (!isOpen) continue;

      if (!day || !rawOpen || !rawClose) continue;

      schedulesToInsert.push({
        branchId,
        day: day as Days,
        openingTime: egyptWallClockToTimeColumn(rawOpen),
        closingTime: egyptWallClockToTimeColumn(rawClose),
      });
    }

    await this.prisma.storeSchedule.deleteMany({
      where: { branchId },
    });

    let result = { count: 0 };
    if (schedulesToInsert.length > 0) {
      result = await this.prisma.storeSchedule.createMany({
        data: schedulesToInsert,
      });
    }

    await this.helpers.syncBranchOpenStatus(branchId);

    return result;
  }

  async createSchedule(data: CreateScheduleDTO): Promise<StoreSchedule> {
    const schedule = await this.prisma.storeSchedule.create({
      data: {
        ...data,
        // Persist the Egypt wall-clock "HH:mm" verbatim (Option A) — no timezone conversion.
        openingTime: egyptWallClockToTimeColumn(data.openingTime),
        closingTime: egyptWallClockToTimeColumn(data.closingTime),
      },
    });

    await this.helpers.syncBranchOpenStatus(data.branchId);

    return schedule;
  }

  async deleteSchedule(id: Id): Promise<void> {
    const schedule = await this.prisma.storeSchedule.delete({
      where: {
        id,
      },
      select: { branchId: true },
    });

    await this.helpers.syncBranchOpenStatus(schedule.branchId);
  }
}
