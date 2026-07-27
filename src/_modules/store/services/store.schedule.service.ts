import { Injectable } from '@nestjs/common';
import { StoreSchedule } from '@prisma/client';
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
    const { schedules } = data;
    await this.prisma.storeSchedule.deleteMany({
      where: { branchId },
    });

    const result = await this.prisma.storeSchedule.createMany({
      data: schedules.map((s) => ({
        ...s,
        branchId,
        // Persist the Egypt wall-clock "HH:mm" verbatim (Option A) — no timezone conversion.
        openingTime: egyptWallClockToTimeColumn(s.openingTime),
        closingTime: egyptWallClockToTimeColumn(s.closingTime),
      })),
    });

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
