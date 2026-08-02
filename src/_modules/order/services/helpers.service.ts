import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  BundleFreeValueRule,
  BundleScopeRole,
  BundleSizeRule,
  CommissionType,
  Coupon,
  CouponType,
  DiscountType,
  FortuneWheelRewardStatus,
  FortuneWheelRewardType,
  OrderStatus,
  OrderType,
  Prisma,
  ServiceStatus,
} from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { validBundleWhere } from 'src/_modules/bundle/prisma-args/bundle.prisma.args';
import { ServiceModuleHelper } from 'src/_modules/serviceModule/services/serviceModule.helper.service';
import { ZoneService } from 'src/_modules/zone/zone.service';
import { calculateDistance } from 'src/globals/helpers/calculateDistance.helper';
import { GlobalHelpers } from 'src/globals/services/globalHelpers.service';
import { MapService } from 'src/globals/services/map.service';
import { PrismaService } from 'src/globals/services/prisma.service';
import { PrivateSettingService } from 'src/globals/services/settings.service';
import { BundleSelectionDTO } from '../dto/order.dto';
import {
  selectCouponOBJ,
  SelectCouponObjType,
} from '../prisma-args/coupon.prisma.args';
import {
  selectOrderByIdForValidationOBJ,
  selectOrderByIdForValidationOBJType,
} from '../prisma-args/order.helpers.prisma.arg';

@Injectable()
export class HelpersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly globalHelpers: GlobalHelpers,
    private readonly mapService: MapService,
    private readonly settingService: PrivateSettingService,
    private readonly serviceHelper: ServiceModuleHelper,
    private readonly zoneService: ZoneService,
  ) {}
  async verifyCoupon(
    couponCode: string,
    userId: Id,
    storeId: Id,
    totalPrice: number,
    zoneId: number | null,
  ) {
    if (!couponCode)
      return {
        totalAfterDiscount: totalPrice,
        couponId: undefined,
        discountValue: 0,
      };

    const coupon = await this.prisma.coupon.findUnique({
      where: {
        code: couponCode,
      },
      select: selectCouponOBJ(storeId, userId),
    });
    this.isCouponValid(coupon, totalPrice, zoneId);
    return this.extractDiscount(coupon, totalPrice);
  }
  isCouponValid(
    coupon: SelectCouponObjType,
    totalPrice: number,
    zoneId: number | null,
  ) {
    if (!coupon) throw new BadRequestException('Coupon not found');
    if (!coupon.active) throw new BadRequestException('Coupon is not active');
    if (coupon.startDate > new Date())
      throw new BadRequestException('Coupon has not started yet');

    if (coupon.endDate < new Date())
      throw new BadRequestException('Coupon has expired');

    if (coupon.usageCount >= coupon.maxUsage)
      throw new BadRequestException('Coupon usage limit has been reached');

    if (coupon.minOrderAmount > totalPrice)
      throw new BadRequestException(
        'Coupon cannot be used with this order amount because of minOrderAmount',
      );

    switch (coupon.type) {
      case CouponType.USER_WISE:
        if (!coupon?.UserCoupons?.length)
          throw new BadRequestException('Coupon is not valid for this user');
        if (coupon?.Orders?.length)
          throw new BadRequestException(
            'Coupon has already been used by this user',
          );
        break;
      case CouponType.STORE_WISE:
        if (!coupon?.StoreCoupons?.length)
          throw new BadRequestException('Coupon is not valid for this user');
        if (coupon?.Orders?.length)
          throw new BadRequestException(
            'Coupon has already been used by this user',
          );
        break;
      case CouponType.FIRST_ORDER:
        if (coupon?.Orders?.length)
          throw new BadRequestException('Coupon is not valid for this user');
        break;
      case CouponType.ALL_USERS:
        if (coupon?.Orders?.length)
          throw new BadRequestException(
            'Coupon has already been used by this user',
          );
        break;
      case CouponType.ALL_STORES:
        if (coupon?.Orders?.length)
          throw new BadRequestException(
            'Coupon has already been used by this user',
          );
        break;
      default:
        break;
    }

    // Zone restriction: a coupon with NO linked zones is global. When zones are
    // linked, the order's resolved delivery zone must match one of them. A null
    // zone (PICKUP, or a delivery address outside every active zone) cannot match.
    if (coupon.CouponZones?.length) {
      if (!zoneId || !coupon.CouponZones.some((z) => z.zoneId === zoneId))
        throw new BadRequestException(
          'Coupon is not valid for this delivery zone',
        );
    }
  }
  extractDiscount(coupon: Coupon, totalPrice: number) {
    let discountValue = 0;
    switch (coupon.discountType) {
      case DiscountType.AMOUNT:
        discountValue = coupon.discountValue;
        break;
      case DiscountType.PERCENTAGE:
        discountValue = (totalPrice * coupon.discountValue) / 100;
        if (discountValue > coupon.maxDiscountValue)
          discountValue = coupon.maxDiscountValue;
        break;
      default:
        break;
    }
    // A discount can never exceed the amount it applies to (keeps totalAfterDiscount,
    // the stored discountAmount, and the fortune-reward base from going negative).
    if (discountValue > totalPrice) discountValue = totalPrice;
    return {
      totalAfterDiscount: totalPrice - discountValue,
      couponId: coupon.id,
      discountValue,
    };
  }
  async validateUserAddress(userId: Id, addressId: Id) {
    const address = await this.prisma.address.findUnique({
      where: {
        id: addressId,
        userId,
      },
    });
    if (!address) throw new BadRequestException('Address not found');
    return address;
  }
  async validateServiceAvailability(serviceId: Id, branchId: Id) {
    const service = await this.prisma.service.findUnique({
      where: {
        id: serviceId,
      },
      include: {
        Store: {
          include: {
            branches: {
              where: {
                id: branchId,
              },
            },
          },
        },
      },
    });
    // Since include returns all scalar fields by default, commission should be there.
    // Wait, findUnique without select returns all fields? Yes.
    // But verify if I need to do anything.
    // The previous code used `include` for relations but scalar fields of Service come included.

    if (!service) throw new BadRequestException('Service not found');
    if (service.status !== ServiceStatus.ACTIVE)
      throw new BadRequestException('Service is not active');
    // `available` is the store's own "temporarily unavailable" toggle
    // (distinct from `status`, the admin moderation gate) — it already hid
    // the item from the customer-facing listing, but order creation never
    // actually checked it, so a cached/stale menu could still order it.
    if (!service.available)
      throw new BadRequestException('Service is currently unavailable');

    const branch = service.Store.branches[0];
    if (!branch)
      throw new BadRequestException('Branch not found for this store');
    if (branch.temporarilyClosed)
      throw new BadRequestException('Branch is temporarily closed');
    if (!branch.isActive) throw new BadRequestException('Branch is not active');

    let currentStatus = branch.status || 'OPEN';
    if (currentStatus === 'BUSY' && branch.busyUntil) {
      if (new Date() > new Date(branch.busyUntil)) {
        currentStatus = 'OPEN';
      }
    }

    if (currentStatus === 'CLOSED' || branch.closed) {
      throw new BadRequestException('Branch is closed');
    }

    if (currentStatus === 'BUSY') {
      throw new BadRequestException('Branch is busy');
    }

    return service;
  }

  async validateSizeAndAddons(serviceId: Id, sizeId: Id, addonIds: Id[]) {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        price: true,
        priceAfterDiscount: true,
      },
    });
    let size: { price: number; priceAfterDiscount?: number | null } = {
      price: service.price,
      priceAfterDiscount: service.priceAfterDiscount,
    };
    if (sizeId) {
      size = await this.prisma.serviceSize.findFirst({
        where: { id: sizeId, serviceId, deletedAt: null },
      });
      if (!size)
        throw new BadRequestException('Size not found for this service');
    }
    // RAW effective base price: discounted price when valid, else the original price.
    // Injected BEFORE applyStoreCommission (in calculateOrder) so store commission is
    // still applied exactly once. Same guard as the serialization pipeline.
    const basePrice = this.serviceHelper.effectiveRawPrice(
      size.price,
      size.priceAfterDiscount,
    );
    let addons = [];
    let addonsPrice = 0;
    if (addonIds?.length) {
      addons = await this.prisma.serviceAddon.findMany({
        where: { id: { in: addonIds }, serviceId, deletedAt: null },
      });
      if (addons.length !== addonIds.length) {
        throw new BadRequestException(
          'Some addons were not found for this service',
        );
      }
      // Was summing addon.price unconditionally — a store-configured
      // priceAfterDiscount on an addon had zero effect on what the customer
      // actually got charged. Same raw-discount guard as the size/base price
      // above, just never commission-adjusted (add-ons don't get commission).
      addonsPrice = addons.reduce(
        (sum, addon) =>
          sum +
          this.serviceHelper.effectiveRawPrice(
            addon.price,
            addon.priceAfterDiscount,
          ),
        0,
      );
    }

    return {
      size,
      addons,
      // Net base price for the unit: the selected size's (discounted) price, or the
      // service price when no size is chosen. Store commission applies to this base only.
      basePrice,
      // Add-ons are additive and never receive commission.
      addonsPrice,
      // Kept for backward compatibility (base + addons, pre-commission).
      totalPrice: basePrice + addonsPrice,
    };
  }

  async validateAndPriceBundles(
    bundleSelections: BundleSelectionDTO[],
    branchId: Id,
    storeId: Id,
  ) {
    const pricedSelections = [];
    for (const [selectionIndex, selection] of bundleSelections.entries()) {
      const bundle = await this.prisma.bundle.findFirst({
        where: { id: selection.bundleId, ...validBundleWhere() },
        include: { ScopeServices: true, ScopeCategories: true },
      });
      if (!bundle) throw new BadRequestException('Bundle is not available');
      if (bundle.storeId !== storeId)
        throw new BadRequestException('Bundle does not belong to this store');

      this.validateBundleQuantities(bundle, selection);
      const paidItems = await this.priceBundleLines(
        selection.paidItems,
        bundle,
        BundleScopeRole.PAID,
        branchId,
      );
      const freeItems = await this.priceBundleLines(
        selection.freeItems,
        bundle,
        BundleScopeRole.FREE,
        branchId,
      );
      this.validateFreeValueRule(bundle, paidItems, freeItems);

      pricedSelections.push({
        selectionIndex,
        bundle,
        paidItems,
        freeItems,
        freeDiscountAmount: freeItems.reduce(
          (total, line) => total + line.originalBaseValue * line.quantity,
          0,
        ),
        snapshot: {
          bundleId: bundle.id,
          title: bundle.title,
          type: bundle.type,
          pricingMode: bundle.pricingMode,
          priceBeforeDiscount: bundle.priceBeforeDiscount,
          priceAfterDiscount: bundle.priceAfterDiscount,
          requiredPaidQuantity: bundle.requiredPaidQuantity,
          freeQuantity: bundle.freeQuantity,
          paidSizeRule: bundle.paidSizeRule,
          paidRequiredSizeName: bundle.paidRequiredSizeName,
          freeSizeRule: bundle.freeSizeRule,
          freeRequiredSizeName: bundle.freeRequiredSizeName,
          freeValueRule: bundle.freeValueRule,
          maxFreeItemValue: bundle.maxFreeItemValue,
          paidServiceIds: bundle.ScopeServices.filter(
            (scope) => scope.role === BundleScopeRole.PAID,
          ).map((scope) => scope.serviceId),
          freeServiceIds: bundle.ScopeServices.filter(
            (scope) => scope.role === BundleScopeRole.FREE,
          ).map((scope) => scope.serviceId),
          paidCategoryIds: bundle.ScopeCategories.filter(
            (scope) => scope.role === BundleScopeRole.PAID,
          ).map((scope) => scope.categoryId),
          freeCategoryIds: bundle.ScopeCategories.filter(
            (scope) => scope.role === BundleScopeRole.FREE,
          ).map((scope) => scope.categoryId),
          paidItems: paidItems.map((line) => this.bundleInvoiceLine(line)),
          freeItems: freeItems.map((line) => this.bundleInvoiceLine(line)),
        },
      });
    }
    return pricedSelections;
  }

  private validateBundleQuantities(bundle: any, selection: BundleSelectionDTO) {
    const paidQuantity = this.sumBundleQuantities(selection.paidItems);
    const freeQuantity = this.sumBundleQuantities(selection.freeItems);
    if (paidQuantity !== bundle.requiredPaidQuantity)
      throw new BadRequestException(
        'Paid bundle quantity does not match the offer',
      );
    if (freeQuantity !== bundle.freeQuantity)
      throw new BadRequestException(
        'Free bundle quantity does not match the offer',
      );
  }

  private sumBundleQuantities(lines: BundleSelectionDTO['paidItems']) {
    return lines.reduce((total, line) => total + (line.quantity ?? 1), 0);
  }

  private async priceBundleLines(
    lines: BundleSelectionDTO['paidItems'],
    bundle: any,
    role: BundleScopeRole,
    branchId: Id,
  ) {
    const pricedLines = [];
    const isFixedBundle =
      bundle.pricingMode === 'FIXED' && bundle.priceAfterDiscount != null;

    for (const [lineIndex, line] of lines.entries()) {
      const quantity = line.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity < 1)
        throw new BadRequestException(
          'Bundle item quantity must be at least 1',
        );
      const service = await this.validateServiceAvailability(
        line.serviceId,
        branchId,
      );
      const selected = await this.validateSizeAndAddons(
        line.serviceId,
        line.sizeId,
        line.addonIds,
      );
      this.assertBundleEligibility(bundle, role, service);
      this.assertBundleSizeRule(bundle, role, line.sizeId, selected.size);

      // Free lines zero only the base/size value (no store commission); their addons are
      // still charged. Paid lines carry the store-commission markup as in normal checkout.
      // For FIXED bundles, the fixed priceAfterDiscount is assigned to the first paid line.
      const isFree = role === BundleScopeRole.FREE;
      let baseWithCommission: {
        clientFacingPrice: number;
        storeCommissionPerUnit: number;
      };

      if (isFree) {
        baseWithCommission = {
          clientFacingPrice: 0,
          storeCommissionPerUnit: 0,
        };
      } else if (isFixedBundle) {
        const perUnitFixedPrice =
          bundle.priceAfterDiscount / (bundle.requiredPaidQuantity || 1);
        baseWithCommission = this.serviceHelper.applyStoreCommission(
          perUnitFixedPrice,
          service.Store,
        );
      } else {
        baseWithCommission = this.serviceHelper.applyStoreCommission(
          selected.basePrice,
          service.Store,
        );
      }

      const unitPrice =
        baseWithCommission.clientFacingPrice + selected.addonsPrice;

      pricedLines.push({
        ...line,
        quantity,
        selected,
        service,
        isFree,
        itemTotalPrice: unitPrice * quantity,
        originalBaseValue: isFixedBundle
          ? bundle.priceAfterDiscount / (bundle.requiredPaidQuantity || 1)
          : selected.basePrice,
        addonsCharged: selected.addonsPrice * quantity,
        storeCommission: baseWithCommission.storeCommissionPerUnit * quantity,
      });
    }
    return pricedLines;
  }

  private assertBundleEligibility(
    bundle: any,
    role: BundleScopeRole,
    service: any,
  ) {
    const serviceMatches = bundle.ScopeServices.some(
      (scope) => scope.role === role && scope.serviceId === service.id,
    );
    const categoryMatches = bundle.ScopeCategories.some(
      (scope) => scope.role === role && scope.categoryId === service.categoryId,
    );
    if (!serviceMatches && !categoryMatches)
      throw new BadRequestException(
        'Service is not eligible for this bundle role',
      );
  }

  private assertBundleSizeRule(
    bundle: any,
    role: BundleScopeRole,
    sizeId: Id | undefined,
    size: any,
  ) {
    const rule =
      role === BundleScopeRole.PAID ? bundle.paidSizeRule : bundle.freeSizeRule;
    const requiredName =
      role === BundleScopeRole.PAID
        ? bundle.paidRequiredSizeName
        : bundle.freeRequiredSizeName;
    if (rule !== BundleSizeRule.NAME) return;
    if (!sizeId)
      throw new BadRequestException('A size is required for this bundle item');
    const normalizedRequiredName = this.normalizeSizeName(requiredName);
    const sizeNames = Object.values(size.name as Record<string, string>).map(
      (name) => this.normalizeSizeName(name),
    );
    if (!sizeNames.includes(normalizedRequiredName))
      throw new BadRequestException(
        'Selected size does not match the bundle rule',
      );
  }

  private normalizeSizeName(sizeName: string) {
    return sizeName.trim().toLowerCase();
  }

  private validateFreeValueRule(
    bundle: any,
    paidItems: any[],
    freeItems: any[],
  ) {
    if (bundle.freeValueRule === BundleFreeValueRule.NO_CAP) return;
    const paidBaseValues = paidItems.map((line) => line.originalBaseValue);
    const maximumFreeValue =
      bundle.freeValueRule === BundleFreeValueRule.CAP_TO_CHEAPEST_PAID
        ? Math.min(...paidBaseValues)
        : bundle.maxFreeItemValue;
    if (freeItems.some((line) => line.originalBaseValue > maximumFreeValue))
      throw new BadRequestException('Free item value exceeds the bundle limit');
  }

  private bundleInvoiceLine(line: any) {
    return {
      serviceId: line.serviceId,
      sizeId: line.selected.size?.id,
      quantity: line.quantity,
      originalBaseValue: line.originalBaseValue * line.quantity,
      discountAmount: line.isFree ? line.originalBaseValue * line.quantity : 0,
      addonsCharged: line.addonsCharged,
      finalLinePrice: line.itemTotalPrice,
    };
  }
  async getDeliveryPrice(
    addressId: Id,
    branchId: Id,
    totalPrice: number,
    customerSelectedZoneId?: Id | null,
  ) {
    if (!addressId) return 0;

    const [address, branch] = await Promise.all([
      this.prisma.address.findUnique({ where: { id: addressId } }),
      this.prisma.branch.findUnique({ where: { id: branchId } }),
    ]);
    if (!address || !branch) return 0;

    // Check free delivery threshold
    const freeDeliveryOverSet = await this.prisma.settings.findUnique({
      where: { setting: 'businessFreeDeliveryOver' },
    });
    if (
      freeDeliveryOverSet &&
      totalPrice >= parseFloat(freeDeliveryOverSet.value)
    ) {
      return 0;
    }

    // Product decision: the zone the customer explicitly picked from the
    // dropdown (customerSelectedZoneId) takes priority for pricing over the
    // real, GPS/address-resolved zone — the opposite of every other
    // "reference-only" zoneId in the app. Only falls through to the resolved
    // zone / km-formula when the selected zone has no price of its own.
    if (customerSelectedZoneId != null) {
      const selectedStoreZonePrice =
        await this.zoneService.getStoreZoneDeliveryPrice(
          branch.storeId,
          customerSelectedZoneId,
        );
      if (selectedStoreZonePrice != null) {
        return selectedStoreZonePrice;
      }
      const selectedZonePrice = await this.zoneService.getZoneDeliveryPrice(
        customerSelectedZoneId,
      );
      if (selectedZonePrice != null) {
        return selectedZonePrice;
      }
    }

    const zoneId = await this.zoneService.resolveZoneId(
      address.lat,
      address.lng,
    );

    // Per-store zone pricing: only applies when the admin has specifically
    // enabled it for this branch's store (Store.zonePricingEnabled) and the
    // store set its own price for this zone. Takes priority over the
    // app-wide zone price below. Custom-delivery pricing never looks at this.
    const storeZonePrice = await this.zoneService.getStoreZoneDeliveryPrice(
      branch.storeId,
      zoneId,
    );
    if (storeZonePrice != null) {
      return storeZonePrice;
    }

    // App-wide zone-based pricing: if the customer's address falls inside a
    // zone the admin gave a fixed delivery price, use it directly instead of
    // the per-km formula below.
    const zonePrice = await this.zoneService.getZoneDeliveryPrice(zoneId);
    if (zonePrice != null) {
      return zonePrice;
    }

    // Calculate distance
    let distance = 0;
    try {
      const details = await this.mapService.getBatchDetails(
        address.lat,
        address.lng,
        [{ lat: branch.lat, lng: branch.lng }],
      );
      if (details[0]?.distance !== undefined) {
        distance = details[0].distance;
      } else {
        distance =
          calculateDistance(address.lat, address.lng, branch.lat, branch.lng) /
          1000;
      }
    } catch (e) {
      distance =
        calculateDistance(address.lat, address.lng, branch.lat, branch.lng) /
        1000;
    }
    const settings = await this.settingService.getSettings([
      'shippingKMCharge',
      'deliveryCommission',
    ]);
    console.log('settings', settings);
    const shippingKMCharge = +settings.shippingKMCharge || 10;
    const deliveryCommission = +settings.deliveryCommission || 0;
    console.log(distance);
    // Calculate price
    return distance * shippingKMCharge + deliveryCommission;
  }

  /**
   * Validates whether a delivery location (destLat, destLng) is within the city's coverage area,
   * including the core city radius plus the 5 km (or configured) grace tolerance buffer.
   */
  async validateCityCoverage(
    cityId: number | null | undefined,
    destLat: number,
    destLng: number,
  ) {
    if (!cityId) return;

    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        radius: true,
        toleranceRadius: true,
      },
    });

    if (!city || city.lat == null || city.lng == null) {
      return;
    }

    const baseRadius = city.radius ?? 15;
    const graceBuffer = city.toleranceRadius ?? 5;
    const maxAllowedKm = baseRadius + graceBuffer;

    const distMeters = calculateDistance(city.lat, city.lng, destLat, destLng);
    const distKm = distMeters / 1000;

    if (distKm > maxAllowedKm) {
      throw new BadRequestException(
        `العنوان المحدد يقع خارج نطاق خدمة المدينة وسماح الـ ${graceBuffer} كم (المسافة: ${distKm.toFixed(1)} كم / الحد الأقصى: ${maxAllowedKm} كم)`,
      );
    }
  }

  /**
   * Validates city coverage for a branch order given the branchId and target address coordinates.
   */
  async validateBranchCityCoverage(
    branchId: number,
    destLat: number,
    destLng: number,
  ) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        storeId: true,
        Store: {
          select: {
            cityId: true,
          },
        },
      },
    });
    if (!branch?.Store?.cityId) return;
    await this.validateCityCoverage(branch.Store.cityId, destLat, destLng);
  }

  async getTax(price: number, storeTaxPercent: number) {
    const StoreTaxForAll = await this.prisma.settings.findUnique({
      where: {
        setting: 'StoreTaxForAll',
      },
    });
    const StoreTaxRate = await this.prisma.settings.findUnique({
      where: {
        setting: 'StoreTaxRate',
      },
    });
    const storeTax = (price * storeTaxPercent) / 100;
    if (!StoreTaxForAll || StoreTaxForAll.value === 'false') {
      return {
        tax: storeTax,
        priceAfterTax: price + storeTax,
      };
    } else {
      const settingTaxPercent = StoreTaxRate?.value
        ? Number.parseFloat(StoreTaxRate.value)
        : 0;
      const settingTax = (price * settingTaxPercent) / 100;
      return {
        tax: settingTax,
        priceAfterTax: price + settingTax,
      };
    }
  }
  async getOrderById(id: Id) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: id,
      },
      select: {
        ...selectOrderByIdForValidationOBJ(),
      },
    });
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    return order;
  }
  async canUserAccessOrderId(
    user: CurrentUser,
    order: selectOrderByIdForValidationOBJType,
  ) {
    if (user.Role.roleKey === RolesKeys.ADMIN) {
      return true;
    }
    if (order.Customer.id === user.id || order.deliveryId === user.id) {
      return true;
    }
    if (
      order.OrderItems.some(
        (item: any) => item.Service?.storeId === user.storeId,
      )
    ) {
      return true;
    }
    throw new ForbiddenException('You do not have access to this order');
  }

  // Which actor may drive the order to which status. Admin is exempt (full
  // override for support/exceptions). Everyone else is restricted to the
  // handful of transitions their role actually owns — closes a gap where any
  // accessor (including the customer themselves) could set an order straight
  // to DELIVERED and trigger wallet payouts without ever being prepared,
  // picked up, or delivered.
  //
  // Cancellation is Admin-only by design: the customer app has no cancel
  // action of its own — order cancellation always goes through
  // admin/support, so the customer role gets no transitions at all here.
  assertStatusTransitionAllowed(
    user: CurrentUser,
    order: selectOrderByIdForValidationOBJType,
    status: OrderStatus,
  ) {
    if (user.Role.roleKey === RolesKeys.ADMIN) return;

    if (user.Role.roleKey === RolesKeys.CUSTOMER) {
      throw new ForbiddenException(
        'Only an admin can change an order to this status',
      );
    }

    if (user.Role.roleKey === RolesKeys.STORE) {
      const storeAllowedStatuses: OrderStatus[] = [
        OrderStatus.PREPARING,
        OrderStatus.REJECTED,
        OrderStatus.READY_PICKUP,
      ];
      if (storeAllowedStatuses.includes(status)) {
        return;
      }
      // In-person pickup orders have no driver — the store hands the order
      // over directly, so the store is the one who marks it delivered.
      if (status === OrderStatus.DELIVERED && order.type === OrderType.PICKUP) {
        return;
      }
      throw new ForbiddenException(
        'This status change is not available to the store',
      );
    }

    if (user.Role.roleKey === RolesKeys.DELIVERY) {
      const deliveryAllowedStatuses: OrderStatus[] = [
        OrderStatus.ON_THE_WAY,
        OrderStatus.DELIVERED,
      ];
      if (deliveryAllowedStatuses.includes(status)) {
        return;
      }
      throw new ForbiddenException(
        'This status change is not available to the delivery driver',
      );
    }

    throw new ForbiddenException('You do not have access to this order');
  }

  async canUserRate(userId: Id, orderId: Id) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },
    });
    if (!order)
      throw new BadRequestException('You have not ordered this store');

    if (order?.rated)
      throw new BadRequestException('You have already rated this store');
    if (order.userId !== userId)
      throw new BadRequestException('You do not have access to this order');
    const completedStatus = order.status === OrderStatus.DELIVERED;
    if (!completedStatus)
      throw new BadRequestException(
        'Your Order to this store is not completed',
      );
  }

  /**
   * Calculates the total delivery price across multiple stops.
   * Accepts an ordered array of { lat, lng } stops (minimum 2).
   * The price is computed as:  (total distance km × shippingKMCharge) + deliveryCommission
   */
  async verifyFortuneReward(
    rewardId: Id,
    userId: Id,
    subtotalAfterCoupon: number,
    orderType: OrderType,
    deliveryFeeExclTip: number,
  ): Promise<{ rewardId: Id; rewardDiscount: number; freeDelivery: boolean }> {
    const reward = await this.prisma.fortuneWheelUserReward.findUnique({
      where: { id: rewardId },
    });

    if (!reward) throw new BadRequestException('Fortune reward not found');
    if (reward.userId !== userId)
      throw new BadRequestException('Reward does not belong to you');
    if (reward.status !== FortuneWheelRewardStatus.VALID)
      throw new BadRequestException('Reward has already been used');

    const now = new Date();
    if (reward.expiresAt && reward.expiresAt <= now)
      throw new BadRequestException('Reward has expired');

    if (
      reward.minOrderAmount !== null &&
      subtotalAfterCoupon < reward.minOrderAmount
    )
      throw new BadRequestException(
        `Minimum order amount for this reward is ${reward.minOrderAmount}`,
      );

    if (
      reward.maxOrderAmount !== null &&
      subtotalAfterCoupon > reward.maxOrderAmount
    )
      throw new BadRequestException(
        `Maximum order amount for this reward is ${reward.maxOrderAmount}`,
      );

    let rewardDiscount = 0;
    let freeDelivery = false;

    switch (reward.rewardType) {
      case FortuneWheelRewardType.DISCOUNT:
        rewardDiscount = Math.floor(
          (subtotalAfterCoupon * reward.rewardValue) / 100,
        );
        if (
          reward.maxDiscount !== null &&
          rewardDiscount > reward.maxDiscount
        ) {
          rewardDiscount = reward.maxDiscount;
        }
        break;
      case FortuneWheelRewardType.FIXED_AMOUNT:
        rewardDiscount = reward.rewardValue;
        break;
      case FortuneWheelRewardType.FREE_DELIVERY:
        if (deliveryFeeExclTip <= 0) {
          throw new BadRequestException(
            'This reward cannot be applied: order has no delivery fee',
          );
        }
        freeDelivery = true;
        break;
      default:
        throw new BadRequestException(
          'This reward type cannot be redeemed at checkout',
        );
    }

    return { rewardId, rewardDiscount, freeDelivery };
  }

  async verifyCustomDeliveryReward(
    rewardId: Id,
    userId: Id,
    itemsCost: number,
    deliveryFeeExclTip: number,
  ): Promise<{ rewardId: Id }> {
    const { freeDelivery, rewardDiscount } = await this.verifyFortuneReward(
      rewardId,
      userId,
      itemsCost,
      OrderType.CUSTOM_DELIVERY,
      deliveryFeeExclTip,
    );

    if (!freeDelivery || rewardDiscount > 0) {
      throw new BadRequestException(
        'Only free-delivery rewards can be used with custom delivery orders',
      );
    }

    return { rewardId };
  }

  async consumeFortuneReward(
    tx: Prisma.TransactionClient,
    rewardId: Id,
    userId: Id,
    orderId: Id,
  ): Promise<void> {
    const now = new Date();
    const { count } = await tx.fortuneWheelUserReward.updateMany({
      where: {
        id: rewardId,
        userId,
        status: FortuneWheelRewardStatus.VALID,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: {
        status: FortuneWheelRewardStatus.USED,
        redeemedAt: now,
        redeemedOrderId: orderId,
      },
    });

    if (count === 0) {
      throw new ConflictException('Reward no longer available');
    }
  }

  async getCustomDeliveryPrice(
    stops: { lat: number; lng: number; zoneId?: Id }[],
  ): Promise<number> {
    if (stops.length < 2) {
      throw new BadRequestException('يجب تحديد مكانين على الأقل');
    }

    // App-wide zone-based pricing. If the final destination falls within a zone
    // that has a fixed price, we use that price as the base delivery fee.
    // The extra fee per additional stop is calculated and added separately in
    // OrderService, so we don't need to add it here.
    const lastStop = stops[stops.length - 1];
    if (lastStop.zoneId != null) {
      const selectedZonePrice = await this.zoneService.getZoneDeliveryPrice(
        lastStop.zoneId,
      );
      if (selectedZonePrice != null) {
        return selectedZonePrice;
      }
    }
    
    const resolvedZoneId = await this.zoneService.resolveZoneId(
      lastStop.lat,
      lastStop.lng,
    );
    const zonePrice = await this.zoneService.getZoneDeliveryPrice(resolvedZoneId);
    if (zonePrice != null) {
      return zonePrice;
    }

    let totalDistance = 0;

    // Sum the distance for each consecutive pair of stops
    for (let i = 0; i < stops.length - 1; i++) {
      const origin = stops[i];
      const destination = stops[i + 1];
      let segmentDistance = 0;

      try {
        const details = await this.mapService.getBatchDetails(
          origin.lat,
          origin.lng,
          [{ lat: destination.lat, lng: destination.lng }],
        );
        if (details[0]?.distance !== undefined) {
          segmentDistance = details[0].distance;
        } else {
          segmentDistance =
            calculateDistance(
              origin.lat,
              origin.lng,
              destination.lat,
              destination.lng,
            ) / 1000;
        }
      } catch (e) {
        segmentDistance =
          calculateDistance(
            origin.lat,
            origin.lng,
            destination.lat,
            destination.lng,
          ) / 1000;
      }

      totalDistance += segmentDistance;
    }

    // Custom delivery has its own km rate and base fee — deliberately not
    // shippingKMCharge/deliveryCommission, which price regular store deliveries.
    const settings = await this.settingService.getSettings([
      'customDeliveryKMCharge',
      'customDeliveryBaseFee',
    ]);
    const kmCharge = +settings.customDeliveryKMCharge || 10;
    const baseFee = +settings.customDeliveryBaseFee || 0;

    return totalDistance * kmCharge + baseFee;
  }

  // Custom delivery's own platform commission on the declared items/purchases cost —
  // independent of businessOrderCommissionRate(ForAll)/Type, which price store orders.
  async getCustomDeliveryCommission(itemsCost: number): Promise<number> {
    const settings = await this.settingService.getSettings([
      'customDeliveryCommissionForAll',
      'customDeliveryCommissionRate',
      'customDeliveryCommissionType',
    ]);
    const enabled = settings.customDeliveryCommissionForAll === true;
    if (!enabled) return 0;

    const rate = Number(settings.customDeliveryCommissionRate) || 0;
    const type =
      settings.customDeliveryCommissionType === CommissionType.PERCENTAGE
        ? CommissionType.PERCENTAGE
        : CommissionType.FIXED;

    return type === CommissionType.FIXED ? rate : (itemsCost * rate) / 100;
  }
}
