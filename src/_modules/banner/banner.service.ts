import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BannerTargetType, Prisma } from '@prisma/client';
import { PrismaService } from 'src/globals/services/prisma.service';

import { firstOrMany } from 'src/globals/helpers/first-or-many';
import {
  CreateBannerDTO,
  FilterBannerDTO,
  UpdateBannerDTO,
} from './dto/banner.dto';

import { LanguagesService } from '../languages/languages.service';
import { BannerHelperService } from './helpers/banner.helper.service';
import {
  getBannerArgs,
  getBannerArgsWithSelect,
} from './prisma-args/banner.prisma.args';
@Injectable()
export class BannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly Language: LanguagesService,
    private readonly bannerHelper: BannerHelperService,
  ) {}

  private normalizeClickUrl(url?: string | null): string | null {
    if (!url) return null;
    let trimmed = String(url).trim();
    if (!trimmed) return null;
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }
    return trimmed;
  }

  async create(data: CreateBannerDTO) {
    const normalizedClickUrl = this.normalizeClickUrl(data.clickUrl);
    this.assertTargetTypeConsistency(data.targetType, {
      storeId: data.storeId,
      categoryId: data.categoryId,
      serviceId: data.serviceId,
      hasZones: !!data.zoneIds?.length,
      clickUrl: normalizedClickUrl,
    });

    const zoneIds = await this.validateTargeting({
      storeId: data.storeId,
      categoryId: data.categoryId,
      serviceId: data.serviceId,
      zoneIds: data.zoneIds,
    });

    const createData: Prisma.BannerUncheckedCreateInput = {
      name: data.name,
      image: data.image,
      storeId: data.storeId,
      categoryId: data.categoryId,
      serviceId: data.serviceId,
      targetType: data.targetType,
      order: data.order,
      startDate: data.startDate,
      endDate: data.endDate,
      clickUrl: normalizedClickUrl,
      ...(zoneIds?.length
        ? { Zones: { create: zoneIds.map((zoneId) => ({ zoneId })) } }
        : {}),
    };

    await this.prisma.banner.create({ data: createData });
  }

  async update(id: Id, body: UpdateBannerDTO) {
    const existing = await this.prisma.banner.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        storeId: true,
        categoryId: true,
        serviceId: true,
        targetType: true,
        clickUrl: true,
        _count: { select: { Zones: true } },
      },
    });
    if (!existing) throw new NotFoundException('Banner not found');

    const effectiveStoreId =
      body.storeId !== undefined ? body.storeId : existing.storeId;
    const effectiveCategoryId =
      body.categoryId !== undefined ? body.categoryId : existing.categoryId;
    const effectiveServiceId =
      body.serviceId !== undefined ? body.serviceId : existing.serviceId;
    const effectiveTargetType =
      body.targetType !== undefined ? body.targetType : existing.targetType;
    const effectiveHasZones =
      body.zoneIds !== undefined
        ? body.zoneIds.length > 0
        : existing._count.Zones > 0;
    const effectiveClickUrl =
      body.clickUrl !== undefined
        ? this.normalizeClickUrl(body.clickUrl)
        : existing.clickUrl;

    this.assertTargetTypeConsistency(effectiveTargetType, {
      storeId: effectiveStoreId,
      categoryId: effectiveCategoryId,
      serviceId: effectiveServiceId,
      hasZones: effectiveHasZones,
      clickUrl: effectiveClickUrl,
    });

    const normalizedZoneIds = await this.validateTargeting({
      storeId: effectiveStoreId,
      categoryId: effectiveCategoryId,
      serviceId: effectiveServiceId,
      zoneIds: body.zoneIds,
    });

    const { zoneIds, clickUrl, ...rest } = body;
    const updateData: Prisma.BannerUncheckedUpdateInput = {
      ...rest,
      ...(clickUrl !== undefined
        ? { clickUrl: this.normalizeClickUrl(clickUrl) }
        : {}),
      ...(zoneIds !== undefined
        ? {
            Zones: {
              deleteMany: {},
              create: (normalizedZoneIds ?? []).map((zoneId) => ({ zoneId })),
            },
          }
        : {}),
    };

    await this.prisma.banner.update({ where: { id }, data: updateData });
  }

  async findAll(
    filters: FilterBannerDTO,
    isCustomer = false,
    currentUser?: CurrentUser,
  ) {
    const languages = await this.Language.getCashedLanguages();
    const args = getBannerArgs(filters, languages, isCustomer);
    const argsWithSelect = getBannerArgsWithSelect(
      isCustomer ? currentUser?.id : undefined,
    );

    const data = await this.prisma.banner[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });

    return Array.isArray(data)
      ? data.map((banner) => this.mapBanner(banner))
      : data
        ? this.mapBanner(data)
        : data;
  }

  async count(filters: FilterBannerDTO) {
    const languages = await this.Language.getCashedLanguages();
    const args = getBannerArgs(filters, languages);
    const total = await this.prisma.banner.count({ where: args.where });

    return total;
  }

  async delete(id: Id): Promise<void> {
    await this.prisma.banner.delete({
      where: {
        id,
      },
    });
  }

  // Admin click statistics: banner name + total clicks. Honours the same
  // filters as the list endpoint (id/name/store/...).
  async statistics(filters: FilterBannerDTO) {
    const languages = await this.Language.getCashedLanguages();
    const args = getBannerArgs(filters, languages);

    return this.prisma.banner[firstOrMany(filters?.id)]({
      ...args,
      select: { id: true, name: true, clickCount: true },
    });
  }

  // Tracks a banner click. 404 when the banner does not exist (or is
  // soft-deleted); inactive banners still accept clicks because the tap may
  // come from cached client UI. The increment itself is best-effort so a
  // tracking failure never breaks the customer's tap-through.
  async trackClick(id: Id): Promise<void> {
    const banner = await this.prisma.banner.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!banner) throw new NotFoundException('Banner not found');

    try {
      await this.prisma.banner.update({
        where: { id },
        data: { clickCount: { increment: 1 } },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to increment banner clickCount', { id, error });
    }
  }

  // Zones the admin may pick for a banner targeting this store: the union of
  // zones linked to the store's branches (Store -> Branch -> BranchZone -> Zone).
  async getAllowedZonesForStore(storeId: Id) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, deletedAt: null },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('Store not found');

    const links = await this.prisma.branchZone.findMany({
      where: { Branch: { storeId, deletedAt: null } },
      select: { Zone: { select: { id: true, name: true } } },
    });

    const unique = new Map<number, (typeof links)[number]['Zone']>();
    for (const link of links) unique.set(link.Zone.id, link.Zone);
    return [...unique.values()];
  }

  // --- helpers -------------------------------------------------------------

  // Flatten the zone join rows and expose explicit routing/scheduling fields so
  // the client never has to infer behaviour from the title/image.
  private mapBanner<
    T extends {
      targetType?: BannerTargetType;
      Zones?: any[];
      Store?: any;
      active?: boolean;
      startDate?: Date | null;
      endDate?: Date | null;
      clickUrl?: string | null;
    },
  >(banner: T) {
    const zones = (banner.Zones ?? []).map((z: any) => z.Zone);
    const normalizedUrl = this.normalizeClickUrl(banner.clickUrl);
    return {
      ...banner,
      clickUrl: normalizedUrl,
      url: normalizedUrl,
      link: normalizedUrl,
      isExternalUrl:
        !!normalizedUrl || banner.targetType === BannerTargetType.EXTERNAL_URL,
      Store: this.mapBannerStore(banner.Store),
      Zones: zones,
      zoneIds: zones.map((z: any) => z.id),
      isSpecialDriverBanner:
        banner.targetType === BannerTargetType.SPECIAL_DRIVER,
      isCurrentlyActive: this.isCurrentlyActive(banner),
    };
  }

  private mapBannerStore(store: any) {
    if (!store) return store;
    const { Favorites, ...rest } = store;
    return {
      ...rest,
      isFavorite: Array.isArray(Favorites) && Favorites.length > 0,
    };
  }

  private isCurrentlyActive(banner: {
    active?: boolean;
    startDate?: Date | null;
    endDate?: Date | null;
  }): boolean {
    if (banner.active === false) return false;
    const now = Date.now();
    if (banner.startDate && new Date(banner.startDate).getTime() > now) {
      return false;
    }
    if (banner.endDate && new Date(banner.endDate).getTime() < now) {
      return false;
    }
    return true;
  }

  private async getAllowedZoneIds(storeId: Id): Promise<number[]> {
    const links = await this.prisma.branchZone.findMany({
      where: { Branch: { storeId, deletedAt: null } },
      select: { zoneId: true },
    });
    return [...new Set(links.map((l) => l.zoneId))];
  }

  private assertTargetTypeConsistency(
    targetType: BannerTargetType | null | undefined,
    fields: {
      storeId?: Id | null;
      categoryId?: Id | null;
      serviceId?: Id | null;
      hasZones: boolean;
      clickUrl?: string | null;
    },
  ): void {
    const { storeId, categoryId, serviceId, hasZones, clickUrl } = fields;

    if (clickUrl && targetType !== BannerTargetType.EXTERNAL_URL) {
      throw new BadRequestException(
        'clickUrl is only allowed when targetType is EXTERNAL_URL',
      );
    }

    if (clickUrl) {
      this.validateClickUrl(clickUrl);
    }

    if (targetType == null) return;

    const hasAnyTargeting =
      storeId != null || categoryId != null || serviceId != null || hasZones;

    switch (targetType) {
      case BannerTargetType.STORE:
        if (storeId == null) {
          throw new BadRequestException('STORE banners require a storeId');
        }
        break;
      case BannerTargetType.CATEGORY:
        if (storeId == null || categoryId == null) {
          throw new BadRequestException(
            'CATEGORY banners require both storeId and categoryId',
          );
        }
        break;
      case BannerTargetType.SERVICE:
        if (storeId == null || categoryId == null || serviceId == null) {
          throw new BadRequestException(
            'SERVICE banners require storeId, categoryId and serviceId',
          );
        }
        break;
      case BannerTargetType.ZONE:
        if (storeId == null || !hasZones) {
          throw new BadRequestException(
            'ZONE banners require a storeId and at least one zoneId',
          );
        }
        break;
      case BannerTargetType.SPECIAL_DRIVER:
        if (hasAnyTargeting) {
          throw new BadRequestException(
            'SPECIAL_DRIVER banners must not include store/category/service/zone targeting',
          );
        }
        break;
      case BannerTargetType.GENERAL:
        if (hasAnyTargeting) {
          throw new BadRequestException(
            'GENERAL banners must not include store/category/service/zone targeting',
          );
        }
        break;
      case BannerTargetType.EXTERNAL_URL:
        if (hasAnyTargeting) {
          throw new BadRequestException(
            'EXTERNAL_URL banners must not include store/category/service/zone targeting',
          );
        }
        if (!clickUrl) {
          throw new BadRequestException(
            'EXTERNAL_URL banners require a clickUrl',
          );
        }
        break;
    }
  }

  private validateClickUrl(url: string): void {
    const normalized = this.normalizeClickUrl(url);
    if (!normalized) {
      throw new BadRequestException('clickUrl must be a valid URL');
    }
    try {
      const parsed = new URL(normalized);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new BadRequestException('clickUrl must be http or https');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('clickUrl must be a valid URL');
    }
  }

  // Enforces the targeting hierarchy (Store -> Category -> Service) and the
  // zone rules. Returns the de-duplicated zoneIds. Throws BadRequest with a
  // clear message on any inconsistent combination.
  private async validateTargeting(input: {
    storeId?: Id | null;
    categoryId?: Id | null;
    serviceId?: Id | null;
    zoneIds?: Id[];
  }): Promise<Id[] | undefined> {
    const { storeId, categoryId, serviceId } = input;
    let zoneIds = input.zoneIds;

    if (categoryId != null && storeId == null) {
      throw new BadRequestException(
        'storeId is required when targeting a category',
      );
    }
    if (serviceId != null && storeId == null) {
      throw new BadRequestException(
        'storeId is required when targeting a service',
      );
    }
    if (zoneIds?.length && storeId == null) {
      throw new BadRequestException('storeId is required when targeting zones');
    }

    if (storeId != null && (categoryId != null || serviceId != null)) {
      const store = await this.prisma.store.findFirst({
        where: { id: storeId, deletedAt: null },
        select: { id: true },
      });
      if (!store) throw new BadRequestException('Invalid storeId');
    }

    if (categoryId != null) {
      const category = await this.prisma.category.findFirst({
        where: { id: categoryId, deletedAt: null },
        select: { id: true, storeId: true },
      });
      if (!category) throw new BadRequestException('Invalid categoryId');
      if (category.storeId !== storeId) {
        throw new BadRequestException(
          'Category does not belong to the selected store',
        );
      }
    }

    if (serviceId != null) {
      const service = await this.prisma.service.findFirst({
        where: { id: serviceId, deletedAt: null },
        select: { id: true, storeId: true, categoryId: true },
      });
      if (!service) throw new BadRequestException('Invalid serviceId');
      if (service.storeId !== storeId) {
        throw new BadRequestException(
          'Service does not belong to the selected store',
        );
      }
      if (categoryId != null && service.categoryId !== categoryId) {
        throw new BadRequestException(
          'Service does not belong to the selected category',
        );
      }
    }

    if (zoneIds?.length) {
      zoneIds = [...new Set(zoneIds)]; // normalize duplicate zone ids
      const allowed = await this.getAllowedZoneIds(storeId!);
      if (allowed.length === 0) {
        throw new BadRequestException(
          'The selected store has no zones linked to its branches',
        );
      }
      const invalid = zoneIds.filter((z) => !allowed.includes(z));
      if (invalid.length) {
        throw new BadRequestException(
          `Zones [${invalid}] are not linked to the selected store's branches`,
        );
      }
    }

    return zoneIds;
  }
}
