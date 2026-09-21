import { Injectable } from '@nestjs/common';
import { resolveCityForPoint } from 'src/globals/helpers/resolve-city-for-point.helper';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(lat?: number, lng?: number, cityId?: number) {
    // Resolve the caller's city directly from cityId if provided, or from coordinates.
    // Falls back gracefully: no city resolved → no city filter applied (safe
    // for single-city deployments and unauthenticated / GPS-off callers).
    const validCityId = cityId != null && !isNaN(cityId) && cityId > 0 ? cityId : undefined;
    let resolvedCityId = validCityId;
    if (!resolvedCityId && lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      const city = await resolveCityForPoint(this.prisma, lat, lng);
      resolvedCityId = city?.id;
    }

    // Banner visibility: show banners that either (a) are targeted to a zone
    // belonging to the caller's city, OR (b) have no zone targeting at all
    // (global banners). When no city is resolved, fall back to showing all
    // active banners (preserves the existing single-city behaviour).
    // NOTE: The Prisma relation on Banner is `Zones` (→ BannerZone[]).
    const bannerCityFilter = resolvedCityId
      ? {
          OR: [
            {
              Zones: {
                some: { Zone: { cityId: resolvedCityId } },
              },
            },
            { Zones: { none: {} } },
          ],
        }
      : {};

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
            bannerCityFilter,
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
