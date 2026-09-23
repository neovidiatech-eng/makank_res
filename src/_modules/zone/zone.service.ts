import { BadRequestException, Injectable } from '@nestjs/common';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import { isPointInPolygon } from '../../globals/helpers/point-in-polygon.helper';
import { resolveCityForPoint } from 'src/globals/helpers/resolve-city-for-point.helper';
import { LanguagesService } from '../languages/languages.service';
import { CreateZoneDTO, FilterZoneDTO, UpdateZoneDTO } from './dto/zone.dto';
import {
  getZoneArgs,
  getZoneArgsWithSelect,
} from './prisma-args/zone.prisma.args';

@Injectable()
export class ZoneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly languages: LanguagesService,
  ) {}

  async create(data: CreateZoneDTO) {
    await this.prisma.zone.create({
      data: {
        name: data.name,
        coordinates: data.coordinates,
        cityId: data.cityId,
        deliveryPrice: data.deliveryPrice,
      },
    });
  }

  async update(id: Id, body: UpdateZoneDTO) {
    await this.prisma.zone.update({ where: { id }, data: body });
  }

  async findAll(filters: FilterZoneDTO) {
    const languages = await this.languages.getCashedLanguages();
    const args = getZoneArgs(filters, languages);
    const argsWithSelect = getZoneArgsWithSelect();

    const data = await this.prisma.zone[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });
    return data;
  }

  async count(filters: FilterZoneDTO) {
    const languages = await this.languages.getCashedLanguages();
    const args = getZoneArgs(filters, languages);
    const total = await this.prisma.zone.count({ where: args.where });

    return total;
  }

  async delete(id: Id): Promise<void> {
    await this.prisma.zone.delete({
      where: {
        id,
      },
    });
  }

  /**
   * Returns active zones scoped to the city that contains the given point.
   * Falls back to ALL active zones when the point resolves to no city
   * (e.g. outside every configured city boundary), so existing behaviour is
   * preserved for single-city deployments.
   */
  private async _resolveCityWhere(lat: number, lng: number) {
    const city = await resolveCityForPoint(this.prisma, lat, lng);
    return {
      active: true as const,
      ...(city ? { cityId: city.id } : {}),
    };
  }

  async isPointInZone(lat: number, lng: number): Promise<boolean> {
    const where = await this._resolveCityWhere(lat, lng);
    const activeZones = await this.prisma.zone.findMany({
      where,
      select: { coordinates: true },
    });

    for (const zone of activeZones) {
      const coordinates = zone.coordinates as Array<{
        lat: number;
        lng: number;
      }>;
      if (isPointInPolygon({ lat, lng }, coordinates)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resolve which active zone a coordinate falls inside.
   * Returns the matching zone id, or null when the point is in no zone or
   * coordinates are missing. Fail-soft: never throws (used in order creation).
   */
  async resolveZoneId(
    lat?: number | null,
    lng?: number | null,
  ): Promise<number | null> {
    if (lat == null || lng == null) return null;

    const where = await this._resolveCityWhere(lat, lng);
    const activeZones = await this.prisma.zone.findMany({
      where,
      select: { id: true, coordinates: true },
    });

    for (const zone of activeZones) {
      const coordinates = zone.coordinates as Array<{
        lat: number;
        lng: number;
      }>;
      if (isPointInPolygon({ lat, lng }, coordinates)) {
        return zone.id;
      }
    }

    return null;
  }

  /**
   * Coverage check for a batch of points (e.g. all stops of a special/custom
   * delivery order). Returns the index of the FIRST point that is not inside
   * any active service zone, or -1 when every point is covered. Each point may
   * fall in a different zone — they need not share one. Active zones are fetched
   * once for the whole batch (unlike isPointInZone, which queries per call), and
   * a point with missing coordinates is treated as uncovered.
   */
  async firstPointOutsideActiveZones(
    points: Array<{ lat?: number | null; lng?: number | null; zoneId?: Id | null }>,
  ): Promise<number> {
    if (!points?.length) return -1;

    // Fetch all active zones once for the whole batch — avoids N queries.
    // City-scoped optimisation: use the first non-null point to resolve a city,
    // then scope the batch to that city.  Falls back to ALL active zones when the
    // city cannot be resolved (single-city deployments, no city configured, etc.).
    let zonesCache: Array<{ coordinates: unknown }> | null = null;
    const getZones = async (lat: number, lng: number) => {
      if (zonesCache !== null) return zonesCache;
      const where = await this._resolveCityWhere(lat, lng);
      zonesCache = await this.prisma.zone.findMany({
        where,
        select: { coordinates: true },
      });
      return zonesCache;
    };

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      // If the stop was explicitly assigned an active zone (e.g. customer selected
      // the zone from the app's dropdown), it is guaranteed covered.
      if (point?.zoneId != null) {
        const activeZone = await this.prisma.zone.findFirst({
          where: { id: Number(point.zoneId), active: true },
          select: { id: true },
        });
        if (activeZone) {
          continue;
        }
      }

      const lat = point?.lat;
      const lng = point?.lng;
      if (lat == null || lng == null) return i;

      const activeZones = await getZones(lat, lng);

      const covered = activeZones.some((zone) => {
        const coords = zone.coordinates as Array<{ lat: number; lng: number }>;
        return coords && Array.isArray(coords) && coords.length > 0
          ? isPointInPolygon({ lat, lng }, coords)
          : false;
      });
      if (!covered) return i;
    }

    return -1;
  }

  // Resolves a representative point for a zone (its vertex centroid) — used by
  // the custom & online-delivery flows when a stop selects a zone without a map pin.
  // When the zone has no polygon coordinates (e.g. zones created without coordinates
  // under a city), it seamlessly falls back to its parent City's coordinates.
  async getZoneCentroid(zoneId: Id): Promise<{ lat: number; lng: number }> {
    const zone = await this.prisma.zone.findFirst({
      where: { id: zoneId, active: true },
      select: {
        coordinates: true,
        City: {
          select: { lat: true, lng: true, coordinates: true },
        },
      },
    });
    if (!zone) {
      throw new BadRequestException('المنطقة غير موجودة أو غير نشطة');
    }
    const coordinates = zone.coordinates as Array<{ lat: number; lng: number }>;
    if (coordinates && Array.isArray(coordinates) && coordinates.length > 0) {
      const lat =
        coordinates.reduce((sum, p) => sum + p.lat, 0) / coordinates.length;
      const lng =
        coordinates.reduce((sum, p) => sum + p.lng, 0) / coordinates.length;
      return { lat, lng };
    }
    // Fall back to parent city centroid / coordinates if zone itself has no polygon
    if (zone.City?.lat != null && zone.City?.lng != null) {
      return { lat: zone.City.lat, lng: zone.City.lng };
    }
    const cityCoords = zone.City?.coordinates as Array<{ lat: number; lng: number }>;
    if (cityCoords && Array.isArray(cityCoords) && cityCoords.length > 0) {
      const lat =
        cityCoords.reduce((sum, p) => sum + p.lat, 0) / cityCoords.length;
      const lng =
        cityCoords.reduce((sum, p) => sum + p.lng, 0) / cityCoords.length;
      return { lat, lng };
    }
    throw new BadRequestException('المنطقة ليس لها إحداثيات صالحة');
  }

  // App-wide zone-based delivery pricing: returns the zone's fixed price if an
  // admin set one, or null if not (callers fall back to their own standard
  // base-fee-plus-per-km formula). Used by regular store delivery, 2-stop
  // purchase/restaurant custom-delivery, and each online-delivery dropoff.
  async getZoneDeliveryPrice(zoneId?: Id | null): Promise<number | null> {
    if (zoneId == null) return null;
    const zone = await this.prisma.zone.findUnique({
      where: { id: zoneId },
      select: { deliveryPrice: true },
    });
    // A deliveryPrice of 0 means "not configured" — return null so callers
    // fall through to the per-km formula instead of treating zero as a real price.
    if (zone?.deliveryPrice == null || zone.deliveryPrice === 0) return null;
    return zone.deliveryPrice;
  }

  async getZoneDeliveryPriceEntry(
    zoneId?: Id | null,
  ): Promise<{ price: number; priceAfterDiscount: number | null } | null> {
    if (zoneId == null) return null;
    const zone = await this.prisma.zone.findUnique({
      where: { id: Number(zoneId) },
      select: { deliveryPrice: true, deliveryPriceAfterDiscount: true },
    });
    if (zone?.deliveryPrice == null || zone.deliveryPrice === 0) return null;
    return {
      price: zone.deliveryPrice,
      priceAfterDiscount: zone.deliveryPriceAfterDiscount ?? null,
    };
  }

  // Per-store zone pricing override — only for regular store delivery
  // (HelpersService.getDeliveryPrice), never for custom-delivery/private-driver
  // pricing. Returns null (fall through to the app-wide zone price / km
  // formula) unless the store has zonePricingEnabled AND set its own price for
  // this exact zone.
  async getStoreZoneDeliveryPrice(
    storeId?: Id | null,
    zoneId?: Id | null,
  ): Promise<number | null> {
    if (storeId == null || zoneId == null) return null;
    const row = await this.prisma.storeZonePrice.findUnique({
      where: { storeId_zoneId: { storeId: Number(storeId), zoneId: Number(zoneId) } },
    });
    if (row && row.price != null) {
      return row.price;
    }
    return null;
  }

  async getStoreZonePriceEntry(
    storeId?: Id | null,
    zoneId?: Id | null,
  ): Promise<{ price: number; priceAfterDiscount: number | null } | null> {
    if (storeId == null || zoneId == null) return null;
    const row = await this.prisma.storeZonePrice.findUnique({
      where: { storeId_zoneId: { storeId: Number(storeId), zoneId: Number(zoneId) } },
      select: { price: true, priceAfterDiscount: true },
    });
    if (row && row.price != null) {
      return {
        price: row.price,
        priceAfterDiscount: row.priceAfterDiscount ?? null,
      };
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Custom Delivery (المندوب الخاص) Zone Pricing
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Retrieves the specific custom delivery price entry for a single zone.
   * Returns { price, priceAfterDiscount } or null if not configured.
   */
  async getCustomDeliveryZonePriceEntry(
    zoneId?: Id | null,
  ): Promise<{ price: number; priceAfterDiscount: number | null } | null> {
    if (zoneId == null) return null;
    const row = await this.prisma.settings.findUnique({
      where: { setting: 'customDeliveryZonePrices' },
    });
    if (!row?.value) return null;
    try {
      const map = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      const entry = map[String(zoneId)] ?? map[Number(zoneId)];
      if (entry == null) return null;
      const price = typeof entry === 'number' ? entry : Number(entry.price);
      if (isNaN(price) || price <= 0) return null;
      const priceAfterDiscount =
        typeof entry === 'object' && entry.priceAfterDiscount != null
          ? Number(entry.priceAfterDiscount)
          : null;
      return {
        price,
        priceAfterDiscount:
          priceAfterDiscount != null && !isNaN(priceAfterDiscount) && priceAfterDiscount > 0
            ? priceAfterDiscount
            : null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Retrieves the default custom delivery price for all remaining zones.
   */
  async getCustomDeliveryDefaultPrice(): Promise<number> {
    const row = await this.prisma.settings.findUnique({
      where: { setting: 'customDeliveryDefaultPrice' },
    });
    const val = Number(row?.value);
    return !isNaN(val) && val > 0 ? val : 0;
  }

  /**
   * Returns all active zones with their configured custom delivery prices
   * and the global default price for remaining zones.
   */
  async getCustomDeliveryZonePrices() {
    const [zones, settingsRow, defaultPriceRow] = await Promise.all([
      this.prisma.zone.findMany({
        where: { active: true },
        select: { id: true, name: true, cityId: true, deliveryPrice: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.settings.findUnique({
        where: { setting: 'customDeliveryZonePrices' },
      }),
      this.prisma.settings.findUnique({
        where: { setting: 'customDeliveryDefaultPrice' },
      }),
    ]);

    let pricesMap: Record<string, any> = {};
    if (settingsRow?.value) {
      try {
        pricesMap =
          typeof settingsRow.value === 'string'
            ? JSON.parse(settingsRow.value)
            : settingsRow.value;
      } catch {}
    }

    const defaultPrice = Number(defaultPriceRow?.value) || 0;

    const mappedZones = zones.map((z) => {
      const entry = pricesMap[String(z.id)] ?? pricesMap[z.id];
      const price =
        entry != null
          ? typeof entry === 'number'
            ? entry
            : entry.price != null
              ? Number(entry.price)
              : null
          : null;
      const priceAfterDiscount =
        entry != null && typeof entry === 'object' && entry.priceAfterDiscount != null
          ? Number(entry.priceAfterDiscount)
          : null;

      return {
        zoneId: z.id,
        name: z.name,
        cityId: z.cityId,
        storeDeliveryPrice: z.deliveryPrice,
        price: price != null && !isNaN(price) && price > 0 ? price : null,
        priceAfterDiscount:
          priceAfterDiscount != null && !isNaN(priceAfterDiscount) && priceAfterDiscount > 0
            ? priceAfterDiscount
            : null,
      };
    });

    return {
      defaultPrice,
      zones: mappedZones,
    };
  }

  /**
   * Updates custom delivery zone prices and optional default price for remaining zones.
   */
  async updateCustomDeliveryZonePrices(data: {
    defaultPrice?: number | null;
    zonePrices?: Array<{
      zoneId: number;
      price: number | null;
      priceAfterDiscount?: number | null;
    }>;
  }) {
    // 1. Update defaultPrice if provided
    if (data.defaultPrice !== undefined && data.defaultPrice !== null) {
      const defVal = Number(data.defaultPrice) || 0;
      await this.prisma.settings.upsert({
        where: { setting: 'customDeliveryDefaultPrice' },
        create: {
          setting: 'customDeliveryDefaultPrice',
          domain: 'ORDER',
          dataType: 'NUMBER',
          value: String(defVal),
        },
        update: {
          value: String(defVal),
        },
      });
    }

    // 2. Update specific zone prices if provided
    if (Array.isArray(data.zonePrices)) {
      const existingRow = await this.prisma.settings.findUnique({
        where: { setting: 'customDeliveryZonePrices' },
      });
      let pricesMap: Record<string, any> = {};
      if (existingRow?.value) {
        try {
          pricesMap =
            typeof existingRow.value === 'string'
              ? JSON.parse(existingRow.value)
              : existingRow.value;
        } catch {}
      }

      for (const item of data.zonePrices) {
        const zId = String(item.zoneId);
        if (item.price == null || item.price <= 0 || isNaN(Number(item.price))) {
          delete pricesMap[zId];
        } else {
          pricesMap[zId] = {
            price: Number(item.price),
            priceAfterDiscount:
              item.priceAfterDiscount != null &&
              Number(item.priceAfterDiscount) > 0 &&
              !isNaN(Number(item.priceAfterDiscount))
                ? Number(item.priceAfterDiscount)
                : null,
          };
        }
      }

      const jsonStr = JSON.stringify(pricesMap);
      await this.prisma.settings.upsert({
        where: { setting: 'customDeliveryZonePrices' },
        create: {
          setting: 'customDeliveryZonePrices',
          domain: 'ORDER',
          dataType: 'JSON',
          value: jsonStr,
        },
        update: {
          value: jsonStr,
        },
      });
    }

    return this.getCustomDeliveryZonePrices();
  }
}
