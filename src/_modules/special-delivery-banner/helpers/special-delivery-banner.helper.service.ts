import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class SpecialDeliveryBannerHelperService {
  constructor(private readonly prisma: PrismaService) {}
  async refreshRandomSeeds() {
    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;
    await this.prisma.$connect();

    while (hasMore) {
      const banners = await this.prisma.specialDeliveryBanner.findMany({
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
          this.prisma.specialDeliveryBanner.update({
            where: { id: banner.id },
            data: { randomSeed: Math.random() },
          }),
        ),
      );

      offset += batchSize;
    }
  }
  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    // eslint-disable-next-line no-console
    console.log('Refreshing special delivery banner random seeds...');
    await this.refreshRandomSeeds();
    // eslint-disable-next-line no-console
    console.log('Special delivery banner random seeds refreshed!');
  }
}
