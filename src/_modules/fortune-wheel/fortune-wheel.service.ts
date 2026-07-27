import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  FortuneWheelRewardStatus,
  FortuneWheelRewardType,
  Prisma,
} from '@prisma/client';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { prismaPagination } from 'src/globals/helpers/pagination-params';
import { PrismaService } from 'src/globals/services/prisma.service';
import {
  CreateFortuneWheelItemDTO,
  FilterFortuneWheelItemDTO,
  FilterUserRewardDTO,
  UpdateFortuneWheelItemDTO,
  UpdateFortuneWheelSettingsDTO,
} from './dto/fortune-wheel.dto';
import {
  getFortuneWheelItemArgs,
  getFortuneWheelItemArgsWithSelect,
  selectFortuneWheelUserRewardOBJ,
} from './prisma-args/fortune-wheel.prisma.args';

const DEFAULT_DISPLAY_INTERVAL_HOURS = 24;

@Injectable()
export class FortuneWheelService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: CreateFortuneWheelItemDTO) {
    const { sortOrder, ...data } = body;
    this.validateItemPayload(data);

    const resolvedSortOrder =
      sortOrder !== undefined ? sortOrder : await this.nextSortOrder();

    const payload = this.normalizeItemPayload(data);
    await this.prisma.fortuneWheelItem.create({
      data: { ...payload, sortOrder: resolvedSortOrder },
    });
  }

  async update(id: Id, body: UpdateFortuneWheelItemDTO) {
    if (body.rewardType !== undefined || body.rewardValue !== undefined) {
      this.validateItemPayload(body);
    }

    const payload = this.normalizeItemPayload(body);
    await this.prisma.fortuneWheelItem.update({
      where: { id },
      data: payload,
    });
  }

  async findAll(filters: FilterFortuneWheelItemDTO) {
    const args = getFortuneWheelItemArgs(filters);
    const argsWithSelect = getFortuneWheelItemArgsWithSelect();

    return this.prisma.fortuneWheelItem[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });
  }

  async count(filters: FilterFortuneWheelItemDTO) {
    const args = getFortuneWheelItemArgs(filters);
    return this.prisma.fortuneWheelItem.count({ where: args.where });
  }

  async delete(id: Id) {
    await this.prisma.fortuneWheelItem.delete({ where: { id } });
  }

  async toggleStatus(id: Id) {
    const item = await this.prisma.fortuneWheelItem.findFirstOrThrow({
      where: { id },
      select: { isActive: true },
    });

    await this.prisma.fortuneWheelItem.update({
      where: { id },
      data: { isActive: !item.isActive },
    });
  }

  // ---------------------------------------------------------------------------
  // Settings (global, single active record)
  // ---------------------------------------------------------------------------

  async getSettings() {
    return this.getOrCreateSettings();
  }

  async updateSettings(body: UpdateFortuneWheelSettingsDTO) {
    const settings = await this.getOrCreateSettings();

    return this.prisma.fortuneWheelSettings.update({
      where: { id: settings.id },
      data: body,
    });
  }

  // ---------------------------------------------------------------------------
  // User-facing display logic (backend is the source of truth)
  // ---------------------------------------------------------------------------

  async getEligibility(userId: Id) {
    const settings = await this.getOrCreateSettings();
    const items = await this.prisma.fortuneWheelItem.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        displayName: true,
        rewardType: true,
        rewardValue: true,
        weight: true,
        maxDiscount: true,
        minOrderAmount: true,
        maxOrderAmount: true,
        rewardExpiryHours: true,
      },
    });

    const base = {
      displayIntervalHours: settings.displayIntervalHours,
    };

    if (!settings.isEnabled || items.length === 0) {
      return { shouldShow: false, nextEligibleAt: null, ...base, items: [] };
    }

    const state = await this.prisma.fortuneWheelUserState.findUnique({
      where: { userId },
      select: { nextEligibleAt: true },
    });

    const now = new Date();
    const eligible = !state?.nextEligibleAt || now >= state.nextEligibleAt;

    if (eligible) {
      return { shouldShow: true, nextEligibleAt: null, ...base, items };
    }

    return {
      shouldShow: false,
      nextEligibleAt: state.nextEligibleAt,
      ...base,
      items: [],
    };
  }

  // stamps lastShownAt only — does NOT advance nextEligibleAt (that is the spin's job)
  async markShown(userId: Id) {
    const lastShownAt = new Date();

    return this.prisma.fortuneWheelUserState.upsert({
      where: { userId },
      create: { userId, lastShownAt },
      update: { lastShownAt },
    });
  }

  // ---------------------------------------------------------------------------
  // Spin + reward
  // ---------------------------------------------------------------------------

  async spin(userId: Id) {
    return this.prisma.$transaction(async (tx) => {
      const settings = await this.getOrCreateSettings();
      if (!settings.isEnabled) {
        throw new BadRequestException('Fortune wheel is not enabled');
      }

      const items = await tx.fortuneWheelItem.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
          id: true,
          displayName: true,
          rewardType: true,
          rewardValue: true,
          weight: true,
          maxDiscount: true,
          minOrderAmount: true,
          maxOrderAmount: true,
          rewardExpiryHours: true,
        },
      });

      if (items.length === 0) {
        throw new BadRequestException('No active fortune wheel items');
      }

      const now = new Date();
      const nextEligibleAt = new Date(
        now.getTime() + settings.displayIntervalHours * 60 * 60 * 1000,
      );

      // Idempotent: ensure a state row exists before the conditional update
      try {
        await tx.fortuneWheelUserState.create({ data: { userId } });
      } catch (e) {
        if (
          !(e instanceof Prisma.PrismaClientKnownRequestError) ||
          e.code !== 'P2002'
        ) {
          throw e;
        }
        // P2002 = duplicate key — row already exists, continue
      }

      // Single-spin guard: only the first caller that matches the eligible predicate wins
      const { count } = await tx.fortuneWheelUserState.updateMany({
        where: {
          userId,
          OR: [{ nextEligibleAt: null }, { nextEligibleAt: { lte: now } }],
        },
        data: { lastSpunAt: now, nextEligibleAt },
      });

      if (count === 0) {
        throw new ConflictException('Not eligible yet');
      }

      const wonItem = this.weightedPick(items);

      if (wonItem.rewardType === FortuneWheelRewardType.NONE) {
        return {
          isWin: false,
          wonItem: {
            id: wonItem.id,
            displayName: wonItem.displayName,
            rewardType: wonItem.rewardType,
          },
          reward: null,
        };
      }

      const expiresAt = wonItem.rewardExpiryHours
        ? new Date(now.getTime() + wonItem.rewardExpiryHours * 60 * 60 * 1000)
        : null;

      const reward = await tx.fortuneWheelUserReward.create({
        data: {
          userId,
          itemId: wonItem.id,
          rewardType: wonItem.rewardType,
          rewardValue: wonItem.rewardValue,
          maxDiscount: wonItem.maxDiscount,
          minOrderAmount: wonItem.minOrderAmount,
          maxOrderAmount: wonItem.maxOrderAmount,
          status: FortuneWheelRewardStatus.VALID,
          expiresAt,
        },
      });

      return {
        isWin: true,
        wonItem: {
          id: wonItem.id,
          displayName: wonItem.displayName,
          rewardType: wonItem.rewardType,
          rewardValue: wonItem.rewardValue,
          maxDiscount: wonItem.maxDiscount,
          minOrderAmount: wonItem.minOrderAmount,
          maxOrderAmount: wonItem.maxOrderAmount,
        },
        reward: { id: reward.id, expiresAt },
      };
    });
  }

  async listMyRewards(userId: Id, filters: FilterUserRewardDTO) {
    const now = new Date();
    const { status, rewardType, page, limit } = filters;

    let where: Prisma.FortuneWheelUserRewardWhereInput = { userId };

    if (rewardType) {
      where.rewardType = rewardType;
    }

    if (status === 'valid') {
      where = {
        ...where,
        status: FortuneWheelRewardStatus.VALID,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      };
    } else if (status === 'expired') {
      where = {
        ...where,
        status: FortuneWheelRewardStatus.VALID,
        expiresAt: { lte: now },
      };
    } else if (status === 'used') {
      where = {
        ...where,
        status: FortuneWheelRewardStatus.USED,
      };
    }

    const pagination = prismaPagination({ page, limit });

    const [data, total] = await Promise.all([
      this.prisma.fortuneWheelUserReward.findMany({
        where,
        select: selectFortuneWheelUserRewardOBJ(),
        orderBy: { createdAt: 'desc' },
        ...pagination,
      }),
      this.prisma.fortuneWheelUserReward.count({ where }),
    ]);

    return { data, total };
  }

  // ---------------------------------------------------------------------------

  private validateItemPayload(body: Partial<CreateFortuneWheelItemDTO>) {
    const {
      rewardType,
      rewardValue,
      maxDiscount,
      minOrderAmount,
      maxOrderAmount,
    } = body;

    if (rewardType === FortuneWheelRewardType.DISCOUNT) {
      if (rewardValue === undefined || rewardValue === null) {
        throw new BadRequestException(
          'rewardValue is required for DISCOUNT type',
        );
      }
      if (rewardValue < 1 || rewardValue > 100) {
        throw new BadRequestException(
          'rewardValue for DISCOUNT must be between 1 and 100',
        );
      }
      if (maxDiscount !== undefined && maxDiscount <= 0) {
        throw new BadRequestException('maxDiscount must be > 0');
      }
    }

    if (rewardType === FortuneWheelRewardType.FIXED_AMOUNT) {
      if (rewardValue === undefined || rewardValue === null) {
        throw new BadRequestException(
          'rewardValue is required for FIXED_AMOUNT type',
        );
      }
      if (rewardValue <= 0) {
        throw new BadRequestException(
          'rewardValue for FIXED_AMOUNT must be > 0',
        );
      }
    }

    if (
      minOrderAmount !== undefined &&
      maxOrderAmount !== undefined &&
      minOrderAmount > maxOrderAmount
    ) {
      throw new BadRequestException('minOrderAmount must be <= maxOrderAmount');
    }
  }

  private normalizeItemPayload<T extends Partial<CreateFortuneWheelItemDTO>>(
    body: T,
  ): T {
    const nonValueTypes = [
      FortuneWheelRewardType.FREE_DELIVERY,
      FortuneWheelRewardType.NONE,
      FortuneWheelRewardType.CUSTOM,
    ] as string[];

    if (body.rewardType && nonValueTypes.includes(body.rewardType)) {
      return { ...body, rewardValue: null } as T;
    }
    return body;
  }

  private weightedPick<T extends { weight: number } & Record<string, unknown>>(
    items: T[],
  ): T {
    const total = items.reduce(
      (sum, item) => sum + Math.max(0, item.weight),
      0,
    );

    if (total === 0) {
      return items[Math.floor(Math.random() * items.length)];
    }

    const point = Math.random() * total;
    let cumulative = 0;

    for (const item of items) {
      cumulative += Math.max(0, item.weight);
      if (point < cumulative) return item;
    }

    return items[items.length - 1];
  }

  private async getOrCreateSettings() {
    const settings = await this.prisma.fortuneWheelSettings.findFirst({
      orderBy: { id: 'asc' },
    });
    if (settings) return settings;

    return this.prisma.fortuneWheelSettings.create({
      data: { displayIntervalHours: DEFAULT_DISPLAY_INTERVAL_HOURS },
    });
  }

  private async nextSortOrder(): Promise<number> {
    const result = await this.prisma.fortuneWheelItem.aggregate({
      _max: { sortOrder: true },
    });
    return (result._max.sortOrder ?? 0) + 1;
  }
}
