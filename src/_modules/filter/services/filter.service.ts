import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';
import { PrivateSettingService } from 'src/globals/services/settings.service';
import { FilterSlotsDTO } from '../dto/filter.dto';

@Injectable()
export class FilterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingService: PrivateSettingService,
  ) {}

  async getPriceRange() {
    const result = await this.prisma.service.aggregate({
      _min: { price: true },
      _max: { price: true },
    });

    return {
      min: result._min.price || 0,
      max: result._max.price || 0,
    };
  }

  async getPriceSlots(dto: FilterSlotsDTO) {
    const { min, max } = await this.getPriceRange();
    if (min === 0 && max === 0) return [];

    const slots = dto?.slots && dto.slots > 0 ? dto.slots : 10;

    const rawStep = (max - min) / slots;
    const step = rawStep > 0 ? Math.ceil(rawStep) : 1;

    const raw = await this.prisma.$queryRaw<
      {
        bin_index: bigint;
        count: bigint;
        avg_price: number | null;
        min_price: number | null;
        max_price: number | null;
      }[]
    >`
    SELECT
      FLOOR((price - ${min}) / ${step}) AS bin_index,
      COUNT(*) AS count,
      AVG(price) AS avg_price,
      MIN(price) AS min_price,
      MAX(price) AS max_price
    FROM \`services\`
    WHERE price BETWEEN ${min} AND ${max}
    GROUP BY bin_index
    ORDER BY bin_index ASC;
  `;

    const byIndex = new Map<
      number,
      {
        count: number;
        avg: number | null;
        min: number | null;
        max: number | null;
      }
    >();

    for (const r of raw) {
      const i = Math.min(Math.max(Number(r.bin_index), 0), slots - 1);
      byIndex.set(i, {
        count: Number(r.count),
        avg: r.avg_price == null ? null : Number(r.avg_price),
        min: r.min_price == null ? null : Number(r.min_price),
        max: r.max_price == null ? null : Number(r.max_price),
      });
    }

    const all = Array.from({ length: slots }, (_, i) => {
      const slot_from = min + i * step;
      const slot_to = i === slots - 1 ? max : min + (i + 1) * step;
      const agg = byIndex.get(i);

      return {
        index: i,
        slot_from,
        slot_to,
        count: agg?.count ?? 0,
        avg_price: agg?.avg ?? Number(((slot_from + slot_to) / 2).toFixed(2)),
      };
    });

    return all;
  }

  async getKmMaxRange() {
    const maxKm = await this.settingService.getSettings(['storeNearestByKM']);
    return { maxKm: maxKm.storeNearestByKM };
  }
}
