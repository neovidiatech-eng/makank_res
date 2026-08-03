import { Injectable } from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { LogsService } from 'src/_modules/logs/logs.service';
import { assertStoreAccepted } from 'src/globals/helpers/assert-store-accepted.helper';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import { PrivateSettingService } from 'src/globals/services/settings.service';
import { LanguagesService } from '../../languages/languages.service';
import {
  BulkUploadRowResult,
  BulkUploadSummary,
} from '../dto/bulk-upload.dto';
import {
  CreateServiceDTO,
  FilterServiceDTO,
  UpdateServiceDTO,
} from '../dto/service.dto';
import { parseBulkUploadWorkbook } from '../helpers/bulk-upload.helper';
import {
  getServiceArgs,
  getServiceArgsWithSelect,
} from '../prisma-args/service.prisma.args';
import { ServiceModuleHelper } from './serviceModule.helper.service';

@Injectable()
export class ServiceModuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly Language: LanguagesService,
    private readonly helper: ServiceModuleHelper,
    private readonly settingService: PrivateSettingService,
    private readonly logsService: LogsService,
  ) {}

  /**
   * Update the minimum service price for a store
   */
  private async updateStoreMinPrice(storeId: number, tx?: any) {
    const prisma = tx || this.prisma;

    // Services without sizes use their own price, so they need a separate
    // aggregate — ServiceSize alone would silently exclude them from the min.
    const [minSizePrice, minSizelessServicePrice] = await Promise.all([
      prisma.serviceSize.aggregate({
        where: {
          Service: {
            storeId,
            deletedAt: null,
          },
          deletedAt: null,
        },
        _min: {
          price: true,
        },
      }),
      prisma.service.aggregate({
        where: {
          storeId,
          deletedAt: null,
          Sizes: { none: { deletedAt: null } },
        },
        _min: {
          price: true,
        },
      }),
    ]);

    const candidates = [
      minSizePrice._min.price,
      minSizelessServicePrice._min.price,
    ].filter((price): price is number => price != null);

    await prisma.store.update({
      where: { id: storeId },
      data: {
        minServicePrice: candidates.length ? Math.min(...candidates) : 0,
      },
    });
  }

  async create(
    body: CreateServiceDTO,
    // Both checks are cheap alone, but bulk-upload calls create() once per
    // Excel row — re-running them per row turned a 150-row menu into ~300
    // extra, entirely redundant round trips. Bulk-upload does its own
    // upfront-once assertStoreAccepted() and a single updateStoreMinPrice()
    // after the whole batch instead; the normal POST /services path (no
    // options passed) is completely unaffected.
    options?: { skipStoreAcceptedCheck?: boolean; skipMinPriceUpdate?: boolean },
  ) {
    const { Sizes, Addons, ...data } = body;
    if (!options?.skipStoreAcceptedCheck) {
      await assertStoreAccepted(this.prisma, data.storeId);
    }

    await this.prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          ...data,
        },
      });

      if (Sizes?.length) {
        await tx.serviceSize.createMany({
          data: Sizes.map((size) => ({
            ...size,
            serviceId: service.id,
          })),
        });
      }

      if (Addons?.length) {
        await tx.serviceAddon.createMany({
          data: Addons.map((addon) => ({
            ...addon,
            serviceId: service.id,
          })),
        });
      }

      if (!options?.skipMinPriceUpdate) {
        // Update store's minimum service price
        await this.updateStoreMinPrice(data.storeId, tx);
      }
    });
  }

  async findAll(filters: FilterServiceDTO) {
    const languages = await this.Language.getCashedLanguages();
    const args = getServiceArgs(filters, languages);
    const argsWithSelect = getServiceArgsWithSelect(
      filters?.customerId,
      filters?.id,
    );

    // Ensure Category and nested relations are included for mapping

    const services = await this.prisma.service[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });
    const data = await this.helper.mapServices(
      Array.isArray(services) ? services : [services],
    );
    if (filters?.id && data?.length) {
      return data[0];
    }
    return data;
  }

  async count(filters: FilterServiceDTO) {
    const languages = await this.Language.getCashedLanguages();
    const args = getServiceArgs(filters, languages);
    const total = await this.prisma.service.count({ where: args.where });

    return total;
  }

  async update(id: Id, body: UpdateServiceDTO, user?: CurrentUser) {
    const { Sizes, Addons, ...data } = body;

    const before = await this.prisma.service.findUnique({
      where: { id },
      select: { name: true, price: true, priceAfterDiscount: true, storeId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      const service = await tx.service.update({
        where: { id },
        data: {
          ...data,
        },
      });

      // Only replace sizes/addons when the caller actually sent them. A partial
      // update (e.g. toggling `available`) omits these arrays and must leave the
      // existing rows untouched — otherwise the unconditional soft-delete would
      // wipe every size/addon with nothing to recreate.
      if (Sizes !== undefined) {
        await tx.serviceSize.updateMany({
          where: { serviceId: id },
          data: { deletedAt: new Date() },
        });

        if (Sizes.length) {
          await tx.serviceSize.createMany({
            data: Sizes.map((size) => ({
              ...size,
              serviceId: id,
            })),
          });
        }
      }

      if (Addons !== undefined) {
        await tx.serviceAddon.updateMany({
          where: { serviceId: id },
          data: { deletedAt: new Date() },
        });

        if (Addons.length) {
          await tx.serviceAddon.createMany({
            data: Addons.map((addon) => ({
              ...addon,
              serviceId: id,
            })),
          });
        }
      }

      // Update store's minimum service price
      if (data.storeId) {
        await this.updateStoreMinPrice(data.storeId, tx);
      } else {
        const existingService = await tx.service.findUnique({
          where: { id },
          select: { storeId: true },
        });
        if (existingService?.storeId) {
          await this.updateStoreMinPrice(existingService.storeId, tx);
        }
      }
    });

    if (user && before) {
      const actingUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true },
      });
      const productName =
        (before.name as any)?.ar ?? (before.name as any)?.en ?? `#${id}`;
      const priceChanged =
        (data.price !== undefined && data.price !== before.price) ||
        (data.priceAfterDiscount !== undefined &&
          data.priceAfterDiscount !== before.priceAfterDiscount);

      if (priceChanged) {
        await this.logsService.createLog({
          userId: String(user.id),
          userName: actingUser?.name ?? '',
          userRole: user.Role?.roleKey ?? '',
          action: 'SERVICE_PRICE_UPDATED',
          details: `"${productName}" price changed from ${before.price} to ${data.price ?? before.price}`,
          storeId: before.storeId,
        });
      } else if (Object.keys(data).length > 0) {
        await this.logsService.createLog({
          userId: String(user.id),
          userName: actingUser?.name ?? '',
          userRole: user.Role?.roleKey ?? '',
          action: 'SERVICE_UPDATED',
          details: `"${productName}" updated (${Object.keys(data).join(', ')})`,
          storeId: before.storeId,
        });
      }
    }
  }

  async delete(id: Id) {
    // Get the service to know which store to update
    const service = await this.prisma.service.findUnique({
      where: { id },
      select: { storeId: true },
    });

    await this.prisma.service.delete({
      where: { id },
    });

    // Update store's minimum service price after deletion
    if (service?.storeId) {
      await this.updateStoreMinPrice(service.storeId);
    }
  }

  // Bulk product upload from an Excel sheet — the store owner fills in
  // name/price/category per row, uploads once, and every row is created via
  // the same create() path a single manual add would use (so it gets the
  // same moderation-PENDING gate, min-price recompute, etc. for free).
  // Images are deliberately NOT part of this — the store adds those
  // per-product afterward through the normal edit screen. One bad row never
  // aborts the rest: each row succeeds or fails independently.
  async bulkUploadFromExcel(
    storeId: number,
    buffer: Buffer,
    user?: CurrentUser,
  ): Promise<BulkUploadSummary> {
    const rows = await parseBulkUploadWorkbook(buffer);
    const results: BulkUploadRowResult[] = [];

    // Checked once for the whole batch instead of once per row — the result
    // can't change mid-upload, and re-checking per row turned "store isn't
    // approved yet" into e.g. 150 identical failures instead of one clear
    // upfront rejection.
    await assertStoreAccepted(this.prisma, storeId);

    // Category name -> id, resolved at most once per unique name per upload
    // instead of once per row — a normal menu reuses the same handful of
    // category names across many rows.
    const categoryCache = new Map<string, number>();

    for (const row of rows) {
      try {
        if (!row.categoryAr) {
          throw new Error('القسم مطلوب');
        }
        if (!row.nameAr) {
          throw new Error('اسم المنتج بالعربي مطلوب');
        }
        if (row.price == null || row.price <= 0) {
          throw new Error('السعر مطلوب ولازم يكون رقم أكبر من صفر');
        }
        if (row.durationMinutes != null && row.durationMinutes <= 0) {
          throw new Error('مدة التحضير لازم تكون رقم أكبر من صفر لو اتكتبت');
        }
        if (row.variantErrors.length) {
          throw new Error(row.variantErrors.join('؛ '));
        }
        // Reported as a row error instead of silently dropped, same rigor as
        // the sizes/addons discount checks above (previously a discount >=
        // price, or negative, just vanished with the product created at full
        // price and no indication anything was wrong).
        if (
          row.priceAfterDiscount != null &&
          !this.helper.hasValidDiscount(row.price, row.priceAfterDiscount)
        ) {
          throw new Error(
            'السعر بعد الخصم لازم يكون رقم صفر أو أكبر وأقل من السعر الأصلي',
          );
        }

        const categoryKey = row.categoryAr.trim();
        let categoryId = categoryCache.get(categoryKey);
        if (categoryId === undefined) {
          categoryId = await this.resolveOrCreateCategory(storeId, row.categoryAr);
          categoryCache.set(categoryKey, categoryId);
        }

        await this.create(
          {
            name: { ar: row.nameAr, en: row.nameEn || row.nameAr },
            description: {
              ar: row.descriptionAr || row.nameAr,
              en: row.descriptionEn || row.nameEn || row.nameAr,
            },
            image: 'uploads/default.png',
            durationMinutes: row.durationMinutes ?? 15,
            price: row.price,
            ...(row.priceAfterDiscount != null && {
              priceAfterDiscount: row.priceAfterDiscount,
            }),
            // Matches the "goes live immediately" behavior POST /services
            // now has (moderation gate removed) — bulk-uploaded rows get
            // the same treatment, not the Prisma column default.
            status: ServiceStatus.ACTIVE,
            available: row.available,
            storeId,
            categoryId,
            ...(row.sizes.length && {
              Sizes: row.sizes.map((size, index) => ({
                name: { ar: size.name, en: size.name },
                price: size.price,
                ...(size.priceAfterDiscount !== undefined && {
                  priceAfterDiscount: size.priceAfterDiscount,
                }),
                isDefault: index === 0,
              })),
            }),
            ...(row.addons.length && {
              Addons: row.addons.map((addon) => ({
                name: { ar: addon.name, en: addon.name },
                price: addon.price,
                ...(addon.priceAfterDiscount !== undefined && {
                  priceAfterDiscount: addon.priceAfterDiscount,
                }),
              })),
            }),
          } as unknown as CreateServiceDTO,
          { skipStoreAcceptedCheck: true, skipMinPriceUpdate: true },
        );

        results.push({
          row: row.rowNumber,
          productName: row.nameAr,
          status: 'created',
        });
      } catch (error: any) {
        results.push({
          row: row.rowNumber,
          productName: row.nameAr || undefined,
          status: 'failed',
          reason: error?.message || 'حصل خطأ غير متوقع',
        });
      }
    }

    const createdCount = results.filter((r) => r.status === 'created').length;
    const failedCount = results.length - createdCount;

    // Recomputed once for the whole batch instead of after every row.
    if (createdCount > 0) {
      await this.updateStoreMinPrice(storeId);
    }

    if (user) {
      const actingUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true },
      });
      await this.logsService.createLog({
        userId: String(user.id),
        userName: actingUser?.name ?? '',
        userRole: user.Role?.roleKey ?? '',
        action: 'SERVICES_BULK_UPLOADED',
        details: `Bulk product upload: ${createdCount} created, ${failedCount} failed (of ${rows.length} rows)`,
        storeId,
      });
    }

    return {
      totalRows: rows.length,
      createdCount,
      failedCount,
      results,
    };
  }

  private async resolveOrCreateCategory(
    storeId: number,
    name: string,
  ): Promise<number> {
    const trimmed = name.trim();
    const existing = await this.prisma.category.findFirst({
      where: {
        storeId,
        deletedAt: null,
        OR: [
          { name: { path: '$.ar', equals: trimmed } },
          { name: { path: '$.en', equals: trimmed } },
        ],
      },
    });
    if (existing) return existing.id;

    const created = await this.prisma.category.create({
      data: {
        name: { ar: trimmed, en: trimmed },
        storeId,
        active: true,
      },
    });
    return created.id;
  }

  async findGroupedByStore(
    storeId: number,
    customerId?: number,
    roleKey?: string,
  ) {
    // Admins and store owners see all statuses; customers/visitors only see active/available.
    const isAdmin = roleKey === RolesKeys.ADMIN || roleKey === RolesKeys.STORE;
    const categories = await this.prisma.category.findMany({
      where: {
        services: {
          some: {
            storeId,
            status: !isAdmin ? ServiceStatus.ACTIVE : undefined,
            available: !isAdmin ? true : undefined,
            deletedAt: null,
          },
        },
      },
      include: {
        services: {
          where: {
            status: !isAdmin ? ServiceStatus.ACTIVE : undefined,
            available: !isAdmin ? true : undefined,
            storeId,
            deletedAt: null,
          },
          include: {
            Category: true,
            Store: {
              include: {
                branches: {
                  take: 1,
                },
              },
            },
            Favorites: customerId
              ? {
                  where: { customerId },
                }
              : false,
            Sizes: {
              where: { deletedAt: null },
            },
            Addons: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    return Promise.all(
      categories.map(async (category: any) => {
        const { services, ...categoryData } = category;
        return {
          ...categoryData,
          Services: await this.helper.mapServices(services),
        };
      }),
    );
  }
}
