import { Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryPromoScope, PromoDiscountType } from '@prisma/client';
import { PrismaService } from 'src/globals/services/prisma.service';
import { CreateDeliveryPromotionDto } from './dto/create-delivery-promotion.dto';
import { UpdateDeliveryPromotionDto } from './dto/update-delivery-promotion.dto';

export interface DeliveryPriceCalculation {
  /** What the customer pays */
  finalShipping: number;
  /** Contractual base price — what the driver earns */
  originalShipping: number;
  /** Platform subsidy = originalShipping - finalShipping */
  discountAmount: number;
  /** True when a promo was applied */
  isPromotional: boolean;
  /** ID of the applied promotion, null when none */
  promotionId: number | null;
  /** Badge text to display to the customer, null when no promo */
  promotionBadgeText: string | null;
}

@Injectable()
export class DeliveryPromotionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDeliveryPromotionDto) {
    return this.prisma.deliveryPromotion.create({ data: dto as any });
  }

  async findAll(filters?: { isActive?: boolean; scope?: DeliveryPromoScope }) {
    return this.prisma.deliveryPromotion.findMany({
      where: {
        ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
        ...(filters?.scope ? { scope: filters.scope } : {}),
      },
      include: {
        Store: { select: { id: true, name: true, logo: true } },
        Zone: { select: { id: true, name: true } },
      },
      orderBy: [{ scope: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: number) {
    const promo = await this.prisma.deliveryPromotion.findUnique({
      where: { id },
      include: {
        Store: { select: { id: true, name: true, logo: true } },
        Zone: { select: { id: true, name: true } },
      },
    });
    if (!promo) throw new NotFoundException(`DeliveryPromotion #${id} not found`);
    return promo;
  }

  async update(id: number, dto: UpdateDeliveryPromotionDto) {
    await this.findOne(id);
    return this.prisma.deliveryPromotion.update({ where: { id }, data: dto as any });
  }

  async toggle(id: number) {
    const promo = await this.findOne(id);
    return this.prisma.deliveryPromotion.update({
      where: { id },
      data: { isActive: !promo.isActive },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.deliveryPromotion.delete({ where: { id } });
  }

  /**
   * Priority cascade (most specific wins):
   * 1. STORE_ZONE  — storeId + zoneId
   * 2. STORE       — storeId only
   * 3. ZONE        — zoneId only
   * 4. GLOBAL      — entire platform
   *
   * Only active promos within their date window are considered.
   */
  async getActivePromotionForContext(
    storeId: number | null | undefined,
    zoneId: number | null | undefined,
  ) {
    const now = new Date();
    const dateFilter = {
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ],
    };

    // 1. STORE_ZONE
    if (storeId && zoneId) {
      const storeZone = await this.prisma.deliveryPromotion.findFirst({
        where: { scope: DeliveryPromoScope.STORE_ZONE, storeId, zoneId, isActive: true, ...dateFilter },
        orderBy: { createdAt: 'desc' },
      });
      if (storeZone) return storeZone;
    }

    // 2. STORE
    if (storeId) {
      const store = await this.prisma.deliveryPromotion.findFirst({
        where: { scope: DeliveryPromoScope.STORE, storeId, isActive: true, ...dateFilter },
        orderBy: { createdAt: 'desc' },
      });
      if (store) return store;
    }

    // 3. ZONE
    if (zoneId) {
      const zone = await this.prisma.deliveryPromotion.findFirst({
        where: { scope: DeliveryPromoScope.ZONE, zoneId, isActive: true, ...dateFilter },
        orderBy: { createdAt: 'desc' },
      });
      if (zone) return zone;
    }

    // 4. GLOBAL
    const global = await this.prisma.deliveryPromotion.findFirst({
      where: { scope: DeliveryPromoScope.GLOBAL, isActive: true, ...dateFilter },
      orderBy: { createdAt: 'desc' },
    });
    return global ?? null;
  }

  /**
   * Applies a promotion on top of a base price to return the full
   * DeliveryPriceCalculation breakdown.
   */
  applyPromotion(
    basePrice: number,
    promo: { id: number; discountType: PromoDiscountType; promoValue: number; badgeText: string | null } | null,
  ): DeliveryPriceCalculation {
    if (!promo) {
      return {
        finalShipping: basePrice,
        originalShipping: basePrice,
        discountAmount: 0,
        isPromotional: false,
        promotionId: null,
        promotionBadgeText: null,
      };
    }

    let finalShipping: number;
    if (promo.discountType === PromoDiscountType.FIXED_PRICE) {
      finalShipping = Math.max(0, promo.promoValue);
    } else {
      // DISCOUNT_AMOUNT
      finalShipping = Math.max(0, basePrice - promo.promoValue);
    }

    return {
      finalShipping: Math.round(finalShipping * 100) / 100,
      originalShipping: Math.round(basePrice * 100) / 100,
      discountAmount: Math.round((basePrice - finalShipping) * 100) / 100,
      isPromotional: true,
      promotionId: promo.id,
      promotionBadgeText: promo.badgeText ?? 'توصيل مخفض لفترة محدودة',
    };
  }
}
