import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';
import { FilterStoreDTO } from '../dto/store.dto';
@Injectable()
export class StoreNearestService {
  constructor(private readonly prisma: PrismaService) {}

  private async getUserAddress(userId: number) {
    const address = await this.prisma.address.findFirst({
      where: { userId, default: true },
      select: { lat: true, lng: true },
    });

    if (!address) {
      throw new BadRequestException('User has no default address');
    }
    return address;
  }

  private buildWhere(filter: FilterStoreDTO) {
    const whereParts: string[] = [];
    const params: any[] = [];

    if (filter?.rating) {
      whereParts.push(`b.rating >= ?`);
      params.push(filter.rating);
    }
    if (filter?.minRating) {
      whereParts.push(`b.rating >= ?`);
      params.push(filter.minRating);
    }
    if (filter?.templateCategoryId) {
      whereParts.push(`EXISTS (
      SELECT 1 FROM categories c
      WHERE c.store_id = s.id
        AND c.template_category_id = ?
        AND c.deleted_at IS NULL
    )`);
      params.push(filter.templateCategoryId);
    }
    if (filter?.templateId) {
      whereParts.push(`EXISTS (
      SELECT 1 FROM store_template_applications sta
      WHERE sta.store_id = s.id
        AND sta.template_id = ?
    )`);
      params.push(filter.templateId);
    }
    if (filter?.closed) {
      whereParts.push(`b.closed = ?`);
      params.push(filter.closed);
    }
    if (filter?.temporarilyClosed) {
      whereParts.push(`b.temporarily_closed = ?`);
      params.push(filter.temporarilyClosed);
    }
    if (filter?.isVerified !== undefined) {
      whereParts.push(`s.is_verified = ?`);
      params.push(filter.isVerified);
    }
    if (filter?.favouriteCustomerId) {
      whereParts.push(`EXISTS (
      SELECT 1 FROM favorite_store f 
      WHERE f.branch_id = b.id AND f.customer_id = ?
    )`);
      params.push(filter.favouriteCustomerId);
    }

    return {
      sql: whereParts.length ? `AND ${whereParts.join(' AND ')}` : '',
      params,
    };
  }

  async getNearestStores(radiusKm = 50, limit = 10, filter?: FilterStoreDTO) {
    let userLat = Number(filter?.lat);
    let userLng = Number(filter?.lng);

    // Only fetch the saved address when coordinates were not provided by the caller
    if ((!userLat || !userLng) && filter?.customerId) {
      const address = await this.getUserAddress(filter.customerId);
      userLat = Number(address.lat);
      userLng = Number(address.lng);
    }

    if (isNaN(userLat) || isNaN(userLng)) {
      return [];
    }

    const earthRadius = 6371;
    const latDelta = (radiusKm / earthRadius) * (180 / Math.PI);
    const lngDelta =
      (radiusKm / (earthRadius * Math.cos((Math.PI * userLat) / 180))) *
      (180 / Math.PI);

    const minLat = userLat - latDelta;
    const maxLat = userLat + latDelta;
    const minLng = userLng - lngDelta;
    const maxLng = userLng + lngDelta;
    const { sql: whereSql, params: whereParams } = this.buildWhere(filter);

    const customerId = filter?.customerId || 0;

    const result = await this.prisma.$queryRawUnsafe<any>(
      `
    WITH branch_distances AS (
      SELECT
        b.id                          AS branchId,
        b.store_id                    AS id,
        b.name,
        b.lat,
        b.lng,
        b.address,
        b.phone,
        b.rating,
        b.review,
        b.closed,
        b.temporarily_closed          AS temporarilyClosed,
        b.status,
        b.busy_until                  AS busyUntil,
        s.is_verified                 AS isVerified,
        (SELECT COUNT(*) FROM favorite_store fs
         WHERE fs.branch_id = b.id AND fs.customer_id = ?) > 0 AS isAddedToFavorite,
        (
          6371 * acos(
            LEAST(1, GREATEST(-1,
              cos(radians(?)) *
              cos(radians(b.lat)) *
              cos(radians(b.lng) - radians(?)) +
              sin(radians(?)) *
              sin(radians(b.lat))
            ))
          )
        ) AS distance
      FROM branches b
      JOIN stores s ON b.store_id = s.id
      WHERE
        b.lat BETWEEN ? AND ?
        AND b.lng BETWEEN ? AND ?
        AND b.isActive = true
        ${whereSql}
    ),
    nearest AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY distance ASC) AS rn
      FROM branch_distances
      WHERE distance <= ?
    )
    SELECT branchId, id, name, lat, lng, address, phone, rating, review,
           closed, temporarilyClosed, status, busyUntil, isVerified,
           isAddedToFavorite, distance
    FROM nearest
    WHERE rn = 1
    ORDER BY distance ASC
    LIMIT ?;
  `,
      customerId,
      userLat,
      userLng,
      userLat,
      minLat,
      maxLat,
      minLng,
      maxLng,
      ...whereParams,
      radiusKm,
      limit,
    );
    return result;
  }
}
