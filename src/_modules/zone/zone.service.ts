import { BadRequestException, Injectable } from '@nestjs/common';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import { isPointInPolygon } from '../../globals/helpers/point-in-polygon.helper';
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

  async isPointInZone(lat: number, lng: number): Promise<boolean> {
    const activeZones = await this.prisma.zone.findMany({
      where: {
        active: true,
      },
      select: {
        coordinates: true,
      },
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

    const activeZones = await this.prisma.zone.findMany({
      where: { active: true },
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
    points: Array<{ lat?: number | null; lng?: number | null }>,
  ): Promise<number> {
    if (!points?.length) return -1;

    const activeZones = await this.prisma.zone.findMany({
      where: { active: true },
      select: { coordinates: true },
    });

    for (let i = 0; i < points.length; i++) {
      const lat = points[i]?.lat;
      const lng = points[i]?.lng;
      if (lat == null || lng == null) return i;

      const covered = activeZones.some((zone) =>
        isPointInPolygon(
          { lat, lng },
          zone.coordinates as Array<{ lat: number; lng: number }>,
        ),
      );
      if (!covered) return i;
    }

    return -1;
  }

  // Resolves a representative point for a zone (its vertex centroid) — used by
  // the online-delivery flow, which selects zones instead of a map point, so the
  // existing lat/lng-based assignment and geofence machinery still has a
  // coordinate to work with. A simple vertex average is precise enough here:
  // the point is only used for nearest-driver ranking, not zone-coverage
  // enforcement (the zone itself already guarantees coverage).
  async getZoneCentroid(zoneId: Id): Promise<{ lat: number; lng: number }> {
    const zone = await this.prisma.zone.findFirst({
      where: { id: zoneId, active: true },
      select: { coordinates: true },
    });
    if (!zone) {
      throw new BadRequestException('المنطقة غير موجودة أو غير نشطة');
    }
    const coordinates = zone.coordinates as Array<{ lat: number; lng: number }>;
    if (!coordinates?.length) {
      throw new BadRequestException('المنطقة ليس لها إحداثيات صالحة');
    }
    const lat =
      coordinates.reduce((sum, p) => sum + p.lat, 0) / coordinates.length;
    const lng =
      coordinates.reduce((sum, p) => sum + p.lng, 0) / coordinates.length;
    return { lat, lng };
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
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { zonePricingEnabled: true },
    });
    if (!store?.zonePricingEnabled) return null;
    const row = await this.prisma.storeZonePrice.findUnique({
      where: { storeId_zoneId: { storeId, zoneId } },
    });
    return row?.price ?? null;
  }
}
