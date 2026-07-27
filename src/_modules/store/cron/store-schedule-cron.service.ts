import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/globals/services/prisma.service';
import { ScheduleHelpersService } from '../services/store.schedule.helper.service';

@Injectable()
export class StoreScheduleCronService {
  private readonly logger = new Logger(StoreScheduleCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleHelpers: ScheduleHelpersService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async syncBranchesClosedStatusBySchedule() {
    await this.prisma.$connect();
    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    for (const branch of branches) {
      await this.scheduleHelpers.syncBranchOpenStatus(branch.id);
    }

    this.logger.log(
      `Store schedule sync completed for ${branches.length} branches`,
    );
  }

  // Reset manual overrides (Force Open / Force Close) every day at 4:00 AM Cairo time.
  // This ensures that stores which were manually opened/closed return to following
  // their regular schedules on the next day, preventing the "stuck" override conflict.
  @Cron('0 4 * * *', { timeZone: 'Africa/Cairo' })
  async resetBranchStatusOverrides() {
    await this.prisma.$connect();
    const result = await this.prisma.branch.updateMany({
      where: {
        status: { in: ['OPEN', 'CLOSED'] },
        deletedAt: null,
      },
      data: { status: 'NORMAL', statusReason: null },
    });

    this.logger.log(
      `Reset branch status overrides to NORMAL for ${result.count} branches.`,
    );
  }
}
