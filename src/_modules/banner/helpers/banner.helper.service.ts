import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class BannerHelperService {
  constructor(private readonly prisma: PrismaService) {}
  async refreshRandomSeeds() {
    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;
    await this.prisma.$connect();

    while (hasMore) {
      const banners = await this.prisma.banner.findMany({
        select: { id: true },
        skip: offset,
        take: batchSize,
      });

      if (banners.length === 0) {
        hasMore = false;
        break;
      }

      await Promise.all(
        banners.map((banner) =>
          this.prisma.banner.update({
            where: { id: banner.id },
            data: { randomSeed: Math.random() },
          }),
        ),
      );

      offset += batchSize;
    }
  }
  // Run at 2 AM every day
  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    console.log('Refreshing random seeds...');
    await this.refreshRandomSeeds();
    console.log('Random seeds refreshed!');
  }
}
