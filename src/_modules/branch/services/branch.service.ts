import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ZoneService } from 'src/_modules/zone/zone.service';
import { isBranchOpenBySchedule } from 'src/globals/helpers/egypt-time.helper';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import { PrivateSettingService } from 'src/globals/services/settings.service';
import { LanguagesService } from '../../languages/languages.service';
import {
  CreateBranchDTO,
  FilterBranchDTO,
  UpdateBranchDTO,
} from '../dto/branch.dto';
import {
  getBranchArgs,
  selectBranchOBJ,
} from '../prisma-args/branch.prisma.args';

@Injectable()
export class BranchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly language: LanguagesService,
    private readonly settingService: PrivateSettingService,
    private readonly zoneService: ZoneService,
  ) {}

  async create(data: CreateBranchDTO) {
    const { zoneIds, ...rest } = data;
    await this.assertZonesExist(zoneIds);

    const filterByZone = await this.settingService.getSettings([
      'filterByZone',
    ]);
    if (filterByZone.filterByZone) {
      const isInZone = await this.zoneService.isPointInZone(data.lat, data.lng);
      if (!isInZone) {
        throw new BadRequestException('This area not available');
      }
    }
    return await this.prisma.branch.create({
      data: {
        ...rest,
        isActive: true,
        Wallet: {
          create: {},
        },
        ...(zoneIds?.length
          ? {
              BranchZones: {
                create: [...new Set(zoneIds)].map((zoneId) => ({ zoneId })),
              },
            }
          : {}),
      },
    });
  }

  async update(id: Id, data: UpdateBranchDTO) {
    const { zoneIds, ...rest } = data;
    await this.assertZonesExist(zoneIds);
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return await this.prisma.branch.update({
      where: { id },
      data: {
        ...rest,
        // Replace the zone links only when zoneIds is explicitly sent.
        ...(zoneIds !== undefined
          ? {
              BranchZones: {
                deleteMany: {},
                create: [...new Set(zoneIds)].map((zoneId) => ({ zoneId })),
              },
            }
          : {}),
      },
    });
  }

  async delete(id: Id) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (branch.isMainBranch) {
      throw new BadRequestException('Main branch cannot be deleted');
    }
    await this.prisma.branch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findAll(filters: FilterBranchDTO) {
    const languages = await this.language.getCashedLanguages();
    const args = getBranchArgs(filters, languages);
    const select = selectBranchOBJ();

    const data = await this.prisma.branch[firstOrMany(filters?.id)]({
      ...args,
      select,
    });

    if (Array.isArray(data)) {
      const branches = await this.fillMissingBranchZones(data);
      return branches.map((branch) => ({
        ...branch,
        isOpen: this.calculateIsOpen(branch),
      }));
    } else if (data) {
      const [branch] = await this.fillMissingBranchZones([data]);
      return {
        ...branch,
        isOpen: this.calculateIsOpen(branch),
      };
    }

    return data;
  }

  async findOne(id: Id) {
    const select = selectBranchOBJ();
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      select,
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    const [filled] = await this.fillMissingBranchZones([branch]);
    return {
      ...filled,
      isOpen: this.calculateIsOpen(filled),
    };
  }

  // Zone coverage per branch (BranchZone) used to be opt-in, which produced
  // an inconsistent picture: some branches had explicit rows (sometimes
  // pointing at zones since deactivated/deleted, which still slipped past
  // an "is it empty" check since the row itself still existed), others had
  // none at all — so the customer's delivery-zone picker showed everything
  // for one restaurant and nothing usable for another with no visible
  // reason. Per product decision, every branch now unconditionally shows
  // every active zone — BranchZone rows are no longer consulted for this at
  // all, so there's no configuration state left that can produce a partial
  // or empty list.
  private async fillMissingBranchZones<T extends { BranchZones?: any[] }>(
    branches: T[],
  ): Promise<T[]> {
    if (branches.length === 0) return branches;

    const allActiveZones = await this.prisma.zone.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });
    const allZoneBranches = allActiveZones.map((zone) => ({ Zone: zone }));

    return branches.map((branch) => ({
      ...branch,
      BranchZones: allZoneBranches,
    }));
  }

  private calculateIsOpen(branch: any): boolean {
    let currentStatus = branch.status || 'OPEN';
    if (currentStatus === 'BUSY' && branch.busyUntil) {
      if (new Date() > new Date(branch.busyUntil)) {
        currentStatus = 'OPEN';
      }
    }

    if (currentStatus === 'CLOSED') {
      return false;
    }
    if (currentStatus === 'OPEN' || currentStatus === 'BUSY') {
      return true;
    }

    if (branch.closed || branch.temporarilyClosed) {
      return false;
    }

    if (!branch.storeSchedule || branch.storeSchedule.length === 0) {
      return true; // No schedule means always open unless manually closed
    }

    // Checks today's rows, plus yesterday's if it's a still-running overnight
    // window (e.g. Friday 20:00→02:00, checked at 01:00 Saturday) — a same-day
    // -only check would otherwise read this branch as closed right after midnight.
    return isBranchOpenBySchedule(branch.storeSchedule);
  }

  async count(filters: FilterBranchDTO) {
    const languages = await this.language.getCashedLanguages();
    const args = getBranchArgs(filters, languages);
    return await this.prisma.branch.count({ where: args.where });
  }

  // The shared @ValidateExist array validator short-circuits on multi-element
  // arrays (Number([1,2]) is NaN), so a non-existent zoneId would otherwise
  // slip past validation and surface as a Prisma FK 500 on the nested create.
  // Validate existence here so bad zoneIds return a clean 400.
  private async assertZonesExist(zoneIds?: Id[]): Promise<void> {
    if (!zoneIds?.length) return;
    const ids = [...new Set(zoneIds)];
    const found = await this.prisma.zone.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    const foundIds = new Set(found.map((z) => z.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length) {
      throw new BadRequestException(`Zones [${missing}] do not exist`);
    }
  }

  async updateStatus(
    id: number,
    status: any,
    busyMinutes?: number,
    statusReason?: string,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id },
    });

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
        // Only meaningful while the branch is actually stopped — cleared the
        // moment it goes back to OPEN/NORMAL so a stale reason never lingers.
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
