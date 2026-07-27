import { Injectable } from '@nestjs/common';
import { CommissionType } from '@prisma/client';
import { PrismaService } from 'src/globals/services/prisma.service';
import { PrivateSettingService } from 'src/globals/services/settings.service';
import {
  CategoryDTO,
  ServiceAddonDTO,
  ServiceDTO,
  ServiceSizeDTO,
  StoreDTO,
} from '../interfaces/service.interface';

export interface StoreCommissionInput {
  commission?: number | null;
  commissionType?: CommissionType | null;
}

export interface GlobalCommissionSettings {
  enabled: boolean;
  type: CommissionType;
  value: number;
}

@Injectable()
export class ServiceModuleHelper {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingService: PrivateSettingService,
  ) {}

  /**
   * Store commission is the per-store markup baked into the client-facing price of a
   * service (or a selected size). It is applied to the BASE price only — the service
   * price or the selected size price — never to add-ons. PERCENTAGE = percent of the
   * base; FIXED = a flat amount per unit. Returns the customer-facing price and the
   * commission amount added to a single unit.
   */
  /**
   * Discount validity guard (single source of truth for BOTH the serialization and
   * checkout pipelines). A discount counts only when it is a real, sane sale price:
   * present (not null/undefined), non-negative, and strictly below the raw price.
   * A corrupted row (pad >= price or pad < 0) returns false so callers fall back to
   * `price` instead of under/over-charging. Pure O(1), never throws.
   */
  hasValidDiscount(price: number, priceAfterDiscount?: number | null): boolean {
    return (
      priceAfterDiscount != null &&
      priceAfterDiscount >= 0 &&
      priceAfterDiscount < price
    );
  }

  /**
   * RAW (pre-commission) effective price: the discounted price when it is valid,
   * otherwise the original raw price. Must be called BEFORE applyStoreCommission so
   * store commission is applied exactly once on top of the chosen base — never to an
   * already-commission-inclusive value.
   */
  effectiveRawPrice(price: number, priceAfterDiscount?: number | null): number {
    return this.hasValidDiscount(price, priceAfterDiscount)
      ? priceAfterDiscount
      : price;
  }

  applyStoreCommission(basePrice: number, store?: StoreCommissionInput) {
    const commission = store?.commission ?? 0;
    const type = store?.commissionType ?? CommissionType.FIXED;
    const storeCommissionPerUnit =
      type === CommissionType.FIXED
        ? commission
        : (basePrice * commission) / 100;
    return {
      clientFacingPrice: basePrice + storeCommissionPerUnit,
      storeCommissionPerUnit,
    };
  }

  /**
   * Admin global commission configuration. Independent from store commission and
   * applied exactly once per order (see calculateGlobalCommission). Toggle key is
   * `businessOrderCommissionRateForAll`; value `businessOrderCommissionRate`;
   * mode `businessOrderCommissionType` (PERCENTAGE | FIXED).
   */
  async getGlobalCommissionSettings(): Promise<GlobalCommissionSettings> {
    const settings = await this.settingService.getSettings([
      'businessOrderCommissionRateForAll',
      'businessOrderCommissionRate',
      'businessOrderCommissionType',
    ]);
    const enabled = settings.businessOrderCommissionRateForAll === true;
    const value = enabled
      ? Number(settings.businessOrderCommissionRate) || 0
      : 0;
    const type =
      settings.businessOrderCommissionType === CommissionType.PERCENTAGE
        ? CommissionType.PERCENTAGE
        : CommissionType.FIXED;
    return { enabled, type, value };
  }

  /**
   * Global commission amount for a given order subtotal. The subtotal must EXCLUDE
   * delivery fees. PERCENTAGE = percent of subtotal; FIXED = flat amount once.
   */
  calculateGlobalCommission(
    subtotal: number,
    settings: GlobalCommissionSettings,
  ): number {
    if (!settings.enabled) return 0;
    return settings.type === CommissionType.FIXED
      ? settings.value
      : (subtotal * settings.value) / 100;
  }

  mapServices = async (services: any[]): Promise<ServiceDTO[]> => {
    return Array.isArray(services)
      ? services.map((service) => this.mapServiceObject(service))
      : [];
  };

  private mapServiceObject = (service: any): ServiceDTO => {
    const store: StoreCommissionInput = {
      commission: service.Store?.commission ?? 0,
      commissionType: service.Store?.commissionType ?? CommissionType.FIXED,
    };
    const categoryDTO: CategoryDTO = {
      id: service.Category?.id ?? 0,
      name: service.Category?.name ?? '',
    };

    const mainBranch = service.Store?.branches?.[0] || {};
    const storeDTO: StoreDTO = {
      id: service.Store?.id ?? 0,
      name: service.Store?.name ?? '',
      cover: service.Store?.cover ?? '',
      logo: service.Store?.logo ?? '',
      rating: mainBranch.rating ?? 0,
      review: mainBranch.review ?? 0,
      address: mainBranch.address ?? '',
    };

    const sizesDTO: ServiceSizeDTO[] = Array.isArray(service.Sizes)
      ? service.Sizes.map((s: any) => {
          // Raw layer: pick discount only when valid, THEN apply store commission
          // once — identical formula to checkout, so display and charge agree.
          const rawPrice = s.price ?? 0;
          const rawPad = s.priceAfterDiscount;
          const hasDiscount = this.hasValidDiscount(rawPrice, rawPad);
          // Original commission-inclusive price (pre-sale list price).
          const price = this.applyStoreCommission(
            rawPrice,
            store,
          ).clientFacingPrice;
          // Discounted commission-inclusive price, or null when no valid discount.
          const priceAfterDiscount = hasDiscount
            ? this.applyStoreCommission(rawPad, store).clientFacingPrice
            : null;
          return {
            id: s.id ?? 0,
            name: s.name ?? '',
            price,
            priceAfterDiscount,
            // What the customer actually pays (commission-inclusive); derived from the
            // two values already computed — commission is never applied a third time.
            effectivePrice: priceAfterDiscount ?? price,
            hasDiscount,
            isDefault: !!s.isDefault,
          };
        })
      : [];

    if (sizesDTO.length > 0) {
      const defaultIdx = sizesDTO.findIndex((s) => s.isDefault);
      if (defaultIdx > 0) {
        const [def] = sizesDTO.splice(defaultIdx, 1);
        sizesDTO.unshift(def);
      }
    }

    const addonsDTO: ServiceAddonDTO[] = Array.isArray(service.Addons)
      ? service.Addons.map((a: any) => ({
          id: a.id ?? 0,
          name: a.name ?? '',
          price: a.price ?? 0,
        }))
      : [];

    const defaultSize = sizesDTO.find((s) => s.isDefault) || sizesDTO[0];

    // Base price calculation (store commission baked in). Same raw-layer pattern:
    // pick the valid discount first, then apply store commission exactly once.
    const rawBasePrice = service.price ?? 0;
    const rawBasePad = service.priceAfterDiscount;
    const baseHasDiscount = this.hasValidDiscount(rawBasePrice, rawBasePad);
    const { clientFacingPrice } = this.applyStoreCommission(
      rawBasePrice,
      store,
    );
    const basePriceAfterDiscount = baseHasDiscount
      ? this.applyStoreCommission(rawBasePad, store).clientFacingPrice
      : null;
    // Derived from the two values already computed — commission is never reapplied.
    const baseEffectivePrice = basePriceAfterDiscount ?? clientFacingPrice;

    const totalPriceWithDefaults = defaultSize
      ? defaultSize.effectivePrice
      : baseEffectivePrice;

    // When the service has sizes and no base discount, set top-level `price` to
    // the default size's list price so mobile apps comparing `price` vs
    // `priceWithDefaultOptions` don't display fake discount badges.
    const finalClientPrice =
      sizesDTO.length > 0 && !baseHasDiscount && defaultSize
        ? defaultSize.price
        : clientFacingPrice;

    return {
      id: service.id ?? 0,
      name: service.name ?? '',
      description: service.description ?? '',
      image: service.image ?? '',
      durationMinutes: service.durationMinutes ?? 0,
      price: finalClientPrice,
      priceAfterDiscount: basePriceAfterDiscount,
      effectivePrice: baseEffectivePrice,
      hasDiscount: baseHasDiscount,
      commission: store.commission ?? 0,
      commissionType: store.commissionType ?? CommissionType.FIXED,
      status: service.status ?? 'PENDING',
      totalOrders: service.totalOrders ?? 0,
      totalAmountSold: service.totalAmountSold ?? 0,
      rating: service.rating ?? 0,
      review: service.review ?? 0,
      bestRated: !!service.bestRated,
      mostSeller: !!service.mostSeller,
      available: service.available !== undefined ? !!service.available : true,
      createdAt: service.createdAt ?? new Date(),
      priceWithDefaultOptions: totalPriceWithDefaults,
      Category: categoryDTO,
      Store: storeDTO,
      Sizes: sizesDTO,
      Addons: addonsDTO,
      isFavourite: service?.Favorites?.length > 0,
    };
  };
}
