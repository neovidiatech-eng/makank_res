import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationService } from 'src/globals/services/notification.service';
import { PrismaService } from 'src/globals/services/prisma.service';

import { firstOrMany, isOne } from 'src/globals/helpers/first-or-many';
import { paginationParams } from 'src/globals/helpers/pagination-params';
import { resolveCityForPoint } from 'src/globals/helpers/resolve-city-for-point.helper';
import {
  CreateStoreDTO,
  FilterStoreDTO,
  UpdateStoreDTO,
  UpdateStoreUserDTO,
} from '../dto/store.dto';

import { BadRequestException } from '@nestjs/common';
import { CommissionType, CouponType } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { ServiceModuleHelper } from 'src/_modules/serviceModule/services/serviceModule.helper.service';
import { StoreTemplateService } from 'src/_modules/store-template/store-template.service';
import { ZoneService } from 'src/_modules/zone/zone.service';
import { calculateDistance } from 'src/globals/helpers/calculateDistance.helper';
import { hashPassword } from 'src/globals/helpers/password.helpers';
import { MapService } from 'src/globals/services/map.service';
import { PrivateSettingService } from 'src/globals/services/settings.service';
import { LanguagesService } from '../../languages/languages.service';
import {
  getStoreArgs,
  getStoreArgsWithSelect,
} from '../prisma-args/store.prisma.args';
import { HelpersService } from './helpers.service';
import { StoreNearestService } from './store.nearest.service';

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nearestService: StoreNearestService,
    private readonly Language: LanguagesService,
    private readonly settingService: PrivateSettingService,
    private readonly helpersService: HelpersService,
    private readonly mapService: MapService,
    private readonly zoneService: ZoneService,
    private readonly storeTemplateService: StoreTemplateService,
    private readonly notificationService: NotificationService,
    private readonly serviceModuleHelper: ServiceModuleHelper,
  ) {}

  async create(data: CreateStoreDTO, CurrentUser: CurrentUser) {
    // const isStoreAccepted = await this.settingService.getSettings(['storeNeedApproval']);

    const { User, templateId, lat, lng, address, ...storeData } = data;

    // Validate zone
    const filterByZone = await this.settingService.getSettings([
      'filterByZone',
    ]);
    if (filterByZone.filterByZone) {
      const isInZone = await this.zoneService.isPointInZone(lat, lng);
      if (!isInZone) {
        throw new BadRequestException('This area not available');
      }
    }

    const template = await this.prisma.storeTemplate.findFirst({
      where: { id: templateId, active: true, deletedAt: null },
    });
    if (!template)
      throw new NotFoundException('Template not found or inactive');

    // Auto-derived from the main branch's own location, never manually
    // assigned — the store owner already has to enter this address, so
    // there's no separate admin step to remember (and no way for it to
    // drift from reality). Left null if no active city's radius covers
    // this point yet.
    const resolvedCity = await resolveCityForPoint(this.prisma, lat, lng);
    storeData['cityId'] = resolvedCity?.id ?? null;

    if (CurrentUser && CurrentUser.Role.roleKey === RolesKeys.ADMIN) {
      // Admin-created stores are trusted immediately — no review queue.
      storeData['isStoreAccepted'] = true;
      storeData['isVerified'] = true;
    } else {
      // Self-registered stores wait for an admin to approve them via
      // PATCH /stores/:id/approval before they can build their catalog.
      storeData['isStoreAccepted'] = false;
    }
    const existingUser = await this.helpersService.isUserExist(User);
    const user = await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          branches: {
            create: {
              name: { ar: 'الفرع الرئيسى', en: 'Main Branch' },
              phone: User.phone,
              address: address,
              lat: lat,
              lng: lng,
              isActive: true,
              isMainBranch: true,
              Wallet: {
                create: {},
              },
            },
          },
          ...storeData,
        },
      });

      await this.storeTemplateService.applyTemplateWithinTx(
        tx,
        store.id,
        templateId,
      );

      const user = await this.helpersService.createUser(
        User,
        existingUser,
        tx,
        store.id,
      );
      return user;
    });

    return user;
  }

  async update(id: Id, body: UpdateStoreDTO) {
    const { User, lat, lng, address, temporarilyClosed, closed, ...storeData } =
      body;

    if (
      body.deliveryTimeMinMinutes !== undefined &&
      body.deliveryTimeMaxMinutes !== undefined &&
      body.deliveryTimeMaxMinutes < body.deliveryTimeMinMinutes
    ) {
      throw new BadRequestException(
        'deliveryTimeMaxMinutes must be greater than or equal to deliveryTimeMinMinutes',
      );
    }

    const branchFieldsProvided =
      lat !== undefined ||
      lng !== undefined ||
      address !== undefined ||
      temporarilyClosed !== undefined ||
      closed !== undefined ||
      body.status !== undefined;

    // Re-derive the store's city whenever its location moves — using
    // whichever of lat/lng was actually sent plus the branch's existing
    // other coordinate, so a lat-only or lng-only update still resolves
    // correctly instead of comparing against undefined.
    let existingBranch: { lat: number; lng: number } | null = null;
    if (branchFieldsProvided) {
      existingBranch = await this.prisma.branch.findFirst({
        where: { storeId: id },
        select: { lat: true, lng: true },
      });
    }
    if (lat !== undefined || lng !== undefined) {
      const resolvedCity = await resolveCityForPoint(
        this.prisma,
        lat ?? existingBranch?.lat,
        lng ?? existingBranch?.lng,
      );
      storeData['cityId'] = resolvedCity?.id ?? null;
    }

    await this.prisma.$transaction(async (tx) => {
      // Update Store record (if there are fields left)
      if (Object.keys(storeData).length > 0) {
        await tx.store.update({ where: { id }, data: storeData });
      }

      // Update the "main" branch (first one) if branch fields are provided
      if (branchFieldsProvided) {
        const firstBranch = await tx.branch.findFirst({
          where: { storeId: id },
        });
        if (firstBranch) {
          let busyUntil = firstBranch.busyUntil;
          if (body.status === 'BUSY' && body.busyMinutes) {
            busyUntil = new Date();
            busyUntil.setMinutes(busyUntil.getMinutes() + body.busyMinutes);
          } else if (body.status === 'OPEN') {
            busyUntil = null;
          }

          await tx.branch.update({
            where: { id: firstBranch.id },
            data: {
              lat,
              lng,
              address,
              temporarilyClosed,
              closed:
                body.status === 'CLOSED'
                  ? true
                  : body.status === 'OPEN' || body.status === 'BUSY'
                    ? false
                    : (closed ?? firstBranch.closed),
              status: body.status,
              busyUntil,
            },
          });
        }
      }

      if (User && Object.keys(User).length > 0) {
        await this.updateOwnerCredentials(tx, id, User);
      }
    });
  }

  // Applies admin edits to the store owner's actual login row (name/email/
  // phone/password) — previously this whole `User` field was destructured out
  // of the body and never used anywhere, so editing a store's credentials
  // from the admin dashboard silently did nothing to the real login.
  //
  // Also re-pins roleId to the one true default Store role: a store created
  // while the role-lookup bug in HelpersService.createUser was live could
  // have had its owner wired to an arbitrary employee role instead of the
  // full-access owner role (still logs in fine, but then 401s on every
  // permission-gated store endpoint) — touching User here self-heals that.
  private async updateOwnerCredentials(
    tx: Prisma.TransactionClient,
    storeId: Id,
    User: UpdateStoreUserDTO,
  ) {
    // Identified by earliest id, not by its current Role, on purpose: the
    // owner is always the first Store-role user created for a store (before
    // any employee can exist), which still holds even if its Role was
    // mis-wired by the bug this method self-heals below.
    const owner = await tx.user.findFirst({
      where: { storeId, roleKey: RolesKeys.STORE },
      orderBy: { id: 'asc' },
    });
    if (!owner) {
      throw new NotFoundException('Store owner account not found');
    }

    if (User.email || User.phone) {
      const conflict = await tx.user.findFirst({
        where: {
          id: { not: owner.id },
          roleKey: RolesKeys.STORE,
          OR: [
            ...(User.email ? [{ email: User.email }] : []),
            ...(User.phone ? [{ phone: User.phone }] : []),
          ],
        },
      });
      if (conflict) {
        throw new ConflictException(
          'Email or phone already used by another store account',
        );
      }
    }

    const defaultRole = await tx.role.findFirst({
      where: { roleKey: RolesKeys.STORE, default: true },
    });

    await tx.user.update({
      where: { id: owner.id },
      data: {
        ...(User.name !== undefined && { name: User.name }),
        ...(User.email !== undefined && { email: User.email }),
        ...(User.phone !== undefined && { phone: User.phone }),
        ...(User.password !== undefined && {
          password: hashPassword(User.password),
        }),
        ...(defaultRole && { roleId: defaultRole.id }),
      },
    });
  }

  /**
   * Helper method to get nearest stores based on filters
   * Returns empty array if conditions are not met
   */
  private async getNearestStoresIfNeeded(
    filters: FilterStoreDTO,
    isVisitor?: boolean,
  ): Promise<any[]> {
    const customerId = filters?.customerId;
    const shouldFetchNearest = (customerId || isVisitor) && !filters?.id;

    if (!shouldFetchNearest) {
      return [];
    }

    const maxKm = await this.settingService.getSettings(['storeNearestByKM']);
    return this.nearestService.getNearestStores(
      filters?.km || maxKm.storeNearestByKM,
      100000000000000,
      filters,
    );
  }
  async block(id: Id) {
    const isFind = await this.prisma.store.findUnique({ where: { id } });
    if (!isFind) {
      throw new NotFoundException('Store not found');
    }
    if (!isFind.isBlocked) {
      await this.prisma.session.deleteMany({
        where: { User: { storeId: id } },
      });
    }
    await this.prisma.branch.updateMany({
      where: { storeId: id },
      data: { isActive: isFind.isBlocked },
    });
    await this.prisma.store.update({
      where: { id },
      data: { isBlocked: !isFind.isBlocked },
    });
  }

  // Admin review for a self-registered store — the only path that can flip
  // isStoreAccepted once PATCH /stores/:id strips it for non-manage callers.
  async setApproval(id: Id, approved: boolean, reason?: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    await this.prisma.store.update({
      where: { id },
      data: {
        isStoreAccepted: approved,
        ...(approved ? { isVerified: true } : {}),
      },
    });

    const owner = await this.prisma.user.findFirst({
      where: { storeId: id, Role: { default: true, roleKey: 'Store' } },
      select: { id: true },
    });

    if (owner) {
      await this.notificationService.sendLocalizedNotification(
        owner.id,
        approved
          ? { ar: 'تمت الموافقة على متجرك', en: 'Your store has been approved' }
          : {
              ar: 'تم رفض تسجيل متجرك',
              en: 'Your store registration was rejected',
            },
        approved
          ? {
              ar: 'تقدر دلوقتي تضيف تصنيفاتك ومنتجاتك.',
              en: 'You can now add your categories and products.',
            }
          : {
              ar: reason || 'راجع بيانات متجرك وحاول تاني.',
              en: reason || 'Please review your store details and try again.',
            },
        undefined,
        NotificationType.STORE,
      );
    }
  }

  async findAll(filters: FilterStoreDTO, isVisitor?: boolean) {
    const customerId = filters?.customerId;
    const shouldUseNearest = (customerId || isVisitor) && !filters?.id;
    const enforceVisible = !!(customerId || isVisitor);

    // Customer/visitor browse listing only (not a single-store fetch, same
    // scope as shouldUseNearest): the customer only ever sees restaurants in
    // whichever active city their own location resolves to. If their point
    // doesn't fall inside ANY active city's radius, they see no restaurants
    // at all rather than an unscoped/wrong-city list.
    let resolvedCityId: number | null | undefined;
    if (shouldUseNearest && filters?.lat != null && filters?.lng != null) {
      const resolved = await resolveCityForPoint(
        this.prisma,
        filters.lat,
        filters.lng,
      );
      // shouldUseNearest already implies !filters?.id, so this is always
      // the list case — no active city covers this point, so no stores.
      if (!resolved) return [];
      resolvedCityId = resolved.id;
    }

    const [languages, stores] = await Promise.all([
      this.Language.getCashedLanguages(),
      this.getNearestStoresIfNeeded(filters, isVisitor),
    ]);

    const args = getStoreArgs(
      filters,
      languages,
      stores,
      shouldUseNearest,
      enforceVisible,
      shouldUseNearest,
      resolvedCityId,
    );
    // Only the store detail/profile view (single-id fetch) embeds active bundles.
    const argsWithSelect = getStoreArgsWithSelect(customerId, !!filters?.id);
    const data = await this.prisma.store[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });

    if (isOne(filters?.id) && !data) {
      throw new NotFoundException('Store not found');
    }

    const globalCoupons = await this.prisma.coupon.findMany({
      where: {
        active: true,
        expired: false,
        type: CouponType.ALL_STORES,
      },
    });

    const storesArray = Array.isArray(data) ? data : [data];

    // Map nearest branches from the nearest service results
    const nearestBranchMap = new Map();
    if (shouldUseNearest && stores) {
      stores.forEach((s) => nearestBranchMap.set(s.id, s));
    }
    const deliveryPrice = await this.settingService.getSettings([
      'shippingKMCharge',
    ]);

    let processedData = await Promise.all(
      storesArray.map(async (store: any) => {
        const storeCoupon = store.StoreCoupons?.[0]?.Coupon;

        // Select the nearest branch: either from previous results or the closest in the fetched list
        let nearestBranch = nearestBranchMap.get(store.id);

        if (!nearestBranch && store.branches?.length > 0) {
          // If we have coordinates, find the closest branch in the current list
          if (filters?.lat && filters?.lng) {
            nearestBranch = store.branches.reduce((prev, curr) => {
              const distPrev = calculateDistance(
                filters.lat,
                filters.lng,
                prev.lat,
                prev.lng,
              );
              const distCurr = calculateDistance(
                filters.lat,
                filters.lng,
                curr.lat,
                curr.lng,
              );
              return distPrev < distCurr ? prev : curr;
            });
          } else {
            nearestBranch = store.branches[0];
          }
        }

        const branchData = nearestBranch || {};

        const distance =
          branchData.distance ??
          (filters?.lat && filters?.lng && branchData.lat && branchData.lng
            ? calculateDistance(
                filters.lat,
                filters.lng,
                branchData.lat,
                branchData.lng,
              ) / 1000
            : 0);

        // Calculate real-time status
        let currentStatus = branchData.status || 'OPEN';

        const isClosed =
          currentStatus === 'CLOSED'
            ? true
            : currentStatus === 'OPEN' || currentStatus === 'BUSY'
              ? false
              : !!branchData.closed;

        const { Services: topServices, ...storeRest } = store as any;
        const mappedTopServices = await this.serviceModuleHelper.mapServices(
          topServices || [],
        );
        const response = {
          ...storeRest,
          branchId: branchData.branchId || branchData.id,
          address: branchData.address,
          lat: branchData.lat,
          lng: branchData.lng,

          rating: branchData.rating || 0,
          review: branchData.review || 0,
          status: currentStatus,
          busyUntil: branchData.busyUntil,
          closed: isClosed,
          temporarilyClosed: branchData.temporarilyClosed ?? false,
          phone: branchData.phone,
          distance,
          deliveryTime: 0, // Will be calculated below
          deliveryPrice: distance * (+deliveryPrice.shippingKMCharge || 10),
          Coupon: storeCoupon || globalCoupons[0] || null,
          isFavourite: branchData.isAddedToFavorite === 1 ? true : false,
          topServices: mappedTopServices,
        };

        delete response.branches;
        return response;
      }),
    );

    // Customer/visitor browse listing: push busy/closed stores below open
    // ones. Whether a branch is genuinely open right now depends on live
    // status/busyUntil (computed into `response.status`/`response.closed`
    // just above), not a plain sortable DB column, so this can only be done
    // here in JS — and it must run on the FULL matching set, not one page.
    // Pagination for this path was deliberately skipped in getStoreArgs
    // (deferPagination) and is applied here instead, AFTER the sort: doing
    // it the normal way (DB-level LIMIT/OFFSET before this point) would
    // lock in page boundaries before open/busy/closed is even known, and
    // could strand an open store on page 2 behind a closed one holding a
    // page-1 slot.
    if (shouldUseNearest) {
      const openTier = (store: any) =>
        store.status === 'BUSY' || store.closed ? 1 : 0;
      processedData.sort((a, b) => openTier(a) - openTier(b));

      const pagination = paginationParams({
        page: filters?.page,
        limit: filters?.limit,
      });
      if (pagination) {
        const start = (pagination.page - 1) * pagination.limit;
        processedData = processedData.slice(start, start + pagination.limit);
      }
    }

    // Batch calculate professional distances and durations using Google Maps if coordinates are available
    if (filters?.lat && filters?.lng && processedData.length > 0) {
      const locations = processedData
        .filter((d) => d.lat && d.lng)
        .map((s) => ({ lat: s.lat, lng: s.lng }));
      if (locations.length > 0) {
        const googleDetails = await this.mapService.getBatchDetails(
          filters.lat,
          filters.lng,
          locations,
        );
        processedData.forEach((store, index) => {
          if (googleDetails[index]?.distance !== undefined) {
            store.distance = googleDetails[index].distance;
            store.deliveryPrice = store.distance * 10;
          }
          store.deliveryTime = googleDetails[index]?.duration ?? 0;
        });
      }
    }

    return Array.isArray(data) ? processedData : processedData[0];
  }

  async count(filters: FilterStoreDTO, isVisitor?: boolean) {
    const customerId = filters?.customerId;
    const shouldUseNearest = (customerId || isVisitor) && !filters?.id;
    const enforceVisible = !!(customerId || isVisitor);

    let resolvedCityId: number | null | undefined;
    if (shouldUseNearest && filters?.lat != null && filters?.lng != null) {
      const resolved = await resolveCityForPoint(
        this.prisma,
        filters.lat,
        filters.lng,
      );
      if (!resolved) return 0;
      resolvedCityId = resolved.id;
    }

    filters.limit = 100000000;
    const [languages, stores] = await Promise.all([
      this.Language.getCashedLanguages(),
      this.getNearestStoresIfNeeded(filters, isVisitor),
    ]);
    const args = getStoreArgs(
      filters,
      languages,
      stores,
      shouldUseNearest,
      enforceVisible,
      undefined,
      resolvedCityId,
    );
    const total = await this.prisma.store.count({ where: args.where });

    return total;
  }

  async updateCommission(
    id: Id,
    commission: number,
    commissionType: CommissionType,
  ) {
    const isFind = await this.prisma.store.findUnique({ where: { id } });
    if (!isFind) {
      throw new NotFoundException('Store not found');
    }
    // A percentage commission must stay within 0–100; a fixed amount has no upper bound.
    if (commissionType === CommissionType.PERCENTAGE && commission > 100) {
      throw new BadRequestException('Percentage commission cannot exceed 100');
    }
    await this.prisma.store.update({
      where: { id },
      data: { commission, commissionType },
    });
  }

  // Admin-only toggle — see PATCH /stores/:id/zone-pricing/toggle. Turning this
  // off does not delete the store's StoreZonePrice rows, just stops them from
  // applying (they resume working the moment it's re-enabled).
  async toggleZonePricing(id: Id, enabled: boolean) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    await this.prisma.store.update({
      where: { id },
      data: { zonePricingEnabled: enabled },
    });
  }

  async toggleManagedByAdmin(id: Id, enabled: boolean) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    await this.prisma.store.update({
      where: { id },
      data: { managedByAdmin: enabled },
    });
  }

  // Applies one discount (percentage or fixed amount) across every service in
  // the store's catalog — or just one category of it, if categoryId is given
  // — in one call, instead of editing each one by one.
  // Always discounts the service's own base price AND every one of its sizes
  // (if any) — sizeId is optional on an order line even for a service that has
  // sizes (HelpersService.validateSizeAndAddons falls back to the service's
  // own price/discount when no size is selected), so both must stay in sync.
  // Overwrites any existing per-service/per-size discount. A line whose
  // computed price would be negative or not actually lower than the original
  // (ServiceModuleHelper.hasValidDiscount) is left untouched and reported back,
  // instead of ever writing an invalid price.
  async applyStoreDiscount(
    storeId: Id,
    discountType: CommissionType,
    value: number,
    categoryId?: Id,
  ) {
    if (
      discountType === CommissionType.PERCENTAGE &&
      (value <= 0 || value > 100)
    ) {
      throw new BadRequestException(
        'Percentage discount must be between 0 and 100',
      );
    }
    if (discountType === CommissionType.FIXED && value <= 0) {
      throw new BadRequestException('Fixed discount must be greater than 0');
    }

    let serviceWhere: any = { storeId };
    if (categoryId) {
      const categories = await this.prisma.category.findMany({
        where: {
          AND: [
            {
              OR: [
                { storeId },
                { storeId: null },
              ],
            },
            {
              OR: [
                { id: categoryId },
                { templateCategoryId: categoryId },
              ],
            },
          ],
        },
        select: { id: true },
      });
      serviceWhere.categoryId = { in: categories.map((c) => c.id) };
    }

    const services = await this.prisma.service.findMany({
      where: serviceWhere,
      include: {
        Sizes: {
          where: { deletedAt: null },
        },
      },
    });

    const computeDiscounted = (price: number) =>
      Number(
        (discountType === CommissionType.PERCENTAGE
          ? price * (1 - value / 100)
          : price - value
        ).toFixed(2),
      );

    const skipped: { serviceId: Id; sizeId?: Id }[] = [];
    let appliedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const service of services) {
        const discounted = computeDiscounted(service.price);
        if (
          this.serviceModuleHelper.hasValidDiscount(service.price, discounted)
        ) {
          await tx.service.update({
            where: { id: service.id },
            data: { priceAfterDiscount: discounted },
          });
          appliedCount++;
        } else {
          skipped.push({ serviceId: service.id });
        }

        for (const size of service.Sizes) {
          const sizeDiscounted = computeDiscounted(size.price);
          if (
            this.serviceModuleHelper.hasValidDiscount(
              size.price,
              sizeDiscounted,
            )
          ) {
            await tx.serviceSize.update({
              where: { id: size.id },
              data: { priceAfterDiscount: sizeDiscounted },
            });
            appliedCount++;
          } else {
            skipped.push({ serviceId: service.id, sizeId: size.id });
          }
        }
      }
    });

    return { appliedCount, skipped };
  }

  // Reverts the whole catalog (or just one category, if given) back to full
  // price — clears every discount this endpoint (or manual per-service/per-size
  // edits) set.
  async removeStoreDiscount(storeId: Id, categoryId?: Id) {
    let serviceWhere: any = { storeId };
    if (categoryId) {
      const categories = await this.prisma.category.findMany({
        where: {
          AND: [
            {
              OR: [
                { storeId },
                { storeId: null },
              ],
            },
            {
              OR: [
                { id: categoryId },
                { templateCategoryId: categoryId },
              ],
            },
          ],
        },
        select: { id: true },
      });
      serviceWhere.categoryId = { in: categories.map((c) => c.id) };
    }

    const services = await this.prisma.service.findMany({
      where: serviceWhere,
      select: { id: true },
    });
    const serviceIds = services.map((service) => service.id);
    await this.prisma.$transaction([
      this.prisma.service.updateMany({
        where: { id: { in: serviceIds } },
        data: { priceAfterDiscount: null },
      }),
      this.prisma.serviceSize.updateMany({
        where: { serviceId: { in: serviceIds }, deletedAt: null },
        data: { priceAfterDiscount: null },
      }),
    ]);
  }

  // Returns every admin-defined zone alongside this store's own price for it
  // (null where the store hasn't set one). Store dashboards use this as the
  // "template" list to fill in per-zone prices.
  async getZonePrices(storeId: Id) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    const [zones, ownPrices] = await Promise.all([
      this.prisma.zone.findMany({
        where: { active: true },
        select: { id: true, name: true, cityId: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.storeZonePrice.findMany({ where: { storeId } }),
    ]);
    const priceByZoneId = new Map(
      ownPrices.map((row) => [row.zoneId, row.price]),
    );
    return {
      zonePricingEnabled: store.zonePricingEnabled,
      zones: zones.map((zone) => ({
        zoneId: zone.id,
        name: zone.name,
        cityId: zone.cityId,
        price: priceByZoneId.get(zone.id) ?? null,
      })),
    };
  }

  // Customer-facing counterpart to getZonePrices above — that one is locked to
  // the store owner/admin (management view: raw configured prices + the
  // enabled flag, even while disabled). This one is public and returns the
  // EFFECTIVE price per zone for a regular delivery order from this specific
  // store — i.e. exactly what checkout will charge: the store's own price
  // (only if zonePricingEnabled), else the app-wide zone price, else null
  // (meaning the km-formula applies). Lets the mobile app show accurate
  // per-zone prices while the customer is ordering from this particular store,
  // instead of the store-agnostic prices from GET /zones.
  async getEffectiveZonePrices(id: Id) {
    let storeId = id;
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) {
      // The mobile app calls this with the store's MAIN BRANCH id instead of
      // the store id in some builds — the two only happen to match for
      // stores whose branch was created in the same id sequence position
      // (e.g. store 73 / branch 73), so this silently 404'd for any store
      // where they've since diverged (e.g. store 119 / branch 120), with no
      // visible difference in either record's own data. Fall back to
      // resolving `id` as a branch id so the customer isn't blocked on a
      // mobile app release to fix its own request.
      const branch = await this.prisma.branch.findUnique({
        where: { id },
        select: { storeId: true },
      });
      if (!branch) {
        throw new NotFoundException('Store not found');
      }
      storeId = branch.storeId;
    }
    const zones = await this.prisma.zone.findMany({
      where: { active: true },
      select: { id: true, name: true, cityId: true },
      orderBy: { id: 'asc' },
    });
    return Promise.all(
      zones.map(async (zone) => {
        const storePrice = await this.zoneService.getStoreZoneDeliveryPrice(storeId, zone.id);
        const price = storePrice ?? (await this.zoneService.getZoneDeliveryPrice(zone.id));
        return { zoneId: zone.id, name: zone.name, cityId: zone.cityId, price: price ?? null };
      }),
    );
  }

  // Upserts the store's own price for each given zone. Only takes effect for
  // pricing while zonePricingEnabled is true (admin-controlled) — enforced here
  // so a store can't silently start overriding delivery prices the moment the
  // admin flips the switch back on without re-confirming its rows.
  async setZonePrices(storeId: Id, entries: { zoneId: Id; price: number }[]) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    if (!store.zonePricingEnabled) {
      throw new BadRequestException(
        'Zone pricing is not enabled for this store — ask the platform admin to enable it first',
      );
    }
    const zoneIds = entries.map((entry) => entry.zoneId);
    const validZoneCount = await this.prisma.zone.count({
      where: { id: { in: zoneIds }, active: true },
    });
    if (validZoneCount !== new Set(zoneIds).size) {
      throw new BadRequestException('One or more zones are invalid');
    }
    await this.prisma.$transaction(
      entries.map((entry) =>
        this.prisma.storeZonePrice.upsert({
          where: { storeId_zoneId: { storeId, zoneId: entry.zoneId } },
          update: { price: entry.price },
          create: { storeId, zoneId: entry.zoneId, price: entry.price },
        }),
      ),
    );
  }

  async deleteZonePrice(storeId: Id, zoneId: Id): Promise<void> {
    await this.prisma.storeZonePrice.deleteMany({ where: { storeId, zoneId } });
  }

  async delete(id: Id): Promise<void> {
    await this.prisma.store.delete({
      where: {
        id,
      },
    });
  }

  async updateBranchStatus(
    storeId: number,
    status: any,
    busyMinutes?: number,
    statusReason?: string,
  ) {
    // `storeId` here is the store's id (PATCH /stores/:id/status), not a
    // branch id — look up the branch by storeId, preferring the main branch.
    const branch =
      (await this.prisma.branch.findFirst({
        where: { storeId, isMainBranch: true },
      })) ??
      (await this.prisma.branch.findFirst({
        where: { storeId },
      }));

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    let busyUntil: Date | null = null;
    if (status === 'BUSY' && busyMinutes) {
      busyUntil = new Date();
      busyUntil.setMinutes(busyUntil.getMinutes() + busyMinutes);
    }

    await this.prisma.branch.update({
      where: { id: branch.id },
      data: {
        status: status,
        busyUntil: busyUntil,
        statusReason:
          status === 'BUSY' || status === 'CLOSED'
            ? (statusReason ?? branch.statusReason)
            : null,
        closed:
          status === 'CLOSED'
            ? true
            : status === 'OPEN' || status === 'BUSY'
              ? false
              : branch.closed,
      },
    });
  }
}
