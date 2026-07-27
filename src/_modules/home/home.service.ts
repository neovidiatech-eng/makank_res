import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(_lat?: number, _lng?: number) {
    const [templates, categories, banners] = await Promise.all([
      this.prisma.storeTemplate.findMany({
        where: { active: true, deletedAt: null },
        select: {
          id: true,
          name: true,
          description: true,
          image: true,
          moduleType: true,
          order: true,
        },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.templateCategory.findMany({
        where: {
          deletedAt: null,
          template: { active: true, deletedAt: null },
        },
        select: {
          id: true,
          name: true,
          image: true,
          order: true,
          templateId: true,
        },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.banner.findMany({
        where: {
          active: true,
          deletedAt: null,
          AND: [
            { OR: [{ startDate: null }, { startDate: { lte: new Date() } }] },
            { OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
          ],
        },
        select: {
          id: true,
          name: true,
          image: true,
          targetType: true,
          storeId: true,
          categoryId: true,
          serviceId: true,
        },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return { templates, categories, banners };
  }
}
