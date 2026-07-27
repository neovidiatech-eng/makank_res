import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Days, PrismaClient } from '@prisma/client';
import { timeColumnToHHmm } from '../helpers/egypt-time.helper';
import { isSuperAdmin } from '../helpers/is-super-admin.helper';
import { validatePermissions } from '../helpers/validatePermissions.helper';
import { PrismaService } from './prisma.service';

@Injectable()
export class GlobalHelpers {
  constructor(private prisma: PrismaService) {}
  async canUserAccessResource(
    user: CurrentUser,
    modelName: keyof PrismaClient,
    prefix: string,
    resourceId: Id,
    ownerFieldName: string = 'userId',
    ownerCurrentUserField: string = 'id',
    indirectRelation?: boolean,
  ) {
    if (isSuperAdmin(user)) return true;
    const resource = await this.prisma[modelName as string].findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }
    const hasPermission = validatePermissions(
      `${prefix}_manage`,
      user.permissions as any[],
    );

    if (
      resource?.[ownerFieldName] !== user?.[ownerCurrentUserField] &&
      !hasPermission &&
      !indirectRelation
    ) {
      throw new ForbiddenException('You do not have access to this resource');
    }
    if (indirectRelation) {
      const userModel = await this.prisma.user.findUnique({
        where: {
          id: user.id,
        },
      });
      if (!userModel) {
        throw new ForbiddenException('You do not have access to this resource');
      }
      if (userModel?.[`${String(modelName)}Id`] !== resourceId) {
        throw new ForbiddenException('You do not have access to this resource');
      }
    }

    return true;
  }
  async getServiceSchedule(
    serviceId: number,
    date: Date,
    branchId?: number,
  ): Promise<
    {
      day: Days;
      openingClosingTimes: { openingTime: Date; closingTime: Date }[];
      slots: {
        from: string;
        to: string;
        status: 'BOOKED' | 'AVAILABLE';
      }[];
    }[]
  > {
    if (date < new Date())
      throw new BadRequestException('Date cannot be in the past');

    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        Store: {
          include: {
            branches: {
              where: branchId ? { id: branchId } : { isActive: true },
              include: {
                storeSchedule: true,
              },
            },
          },
        },
      },
    });

    if (!service) throw new NotFoundException('Service not found');

    const branches = service.Store.branches;
    if (!branches.length)
      throw new NotFoundException('No active branches found for this store');

    // For simplicity, we'll use the first matching branch's schedule
    // In a real scenario, we might want to merge or handle specific branch selection
    const branch = branches[0];
    const { durationMinutes } = service;

    if (!durationMinutes || durationMinutes <= 0)
      throw new BadRequestException('Invalid service duration');

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const bookedOrders = await this.prisma.order.findMany({
      where: {
        OrderItems: {
          some: {
            serviceId,
          },
        },
        status: {
          notIn: ['CANCELLED', 'REJECTED'],
        },
        date: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      select: {
        date: true,
      },
    });

    const bookedTimes = bookedOrders.map((o) => new Date(o.date));

    const result: {
      day: Days;
      openingClosingTimes: { openingTime: Date; closingTime: Date }[];
      slots: { from: string; to: string; status: 'BOOKED' | 'AVAILABLE' }[];
    }[] = [];

    for (const schedule of branch.storeSchedule) {
      const storeOpen = new Date(schedule.openingTime);
      const storeClose = new Date(schedule.closingTime);

      const start = storeOpen;
      const end = storeClose;

      if (start >= end) continue;
      const openingClosingTimes = [{ openingTime: start, closingTime: end }];

      const slots: {
        from: string;
        to: string;
        status: 'BOOKED' | 'AVAILABLE';
      }[] = [];
      let current = new Date(start);

      while (current < end) {
        const next = new Date(current.getTime() + durationMinutes * 60000);
        if (next > end) break;
        const isBooked = bookedTimes.some((booked) => {
          return (
            booked.getUTCHours() === current.getUTCHours() &&
            booked.getUTCMinutes() === current.getUTCMinutes() &&
            booked.getUTCSeconds() === current.getUTCSeconds()
          );
        });

        slots.push({
          from: timeColumnToHHmm(current),
          to: timeColumnToHHmm(next),
          status: isBooked ? 'BOOKED' : 'AVAILABLE',
        });

        current = next;
      }

      const existing = result.find((r) => r.day === schedule.day);
      if (existing) {
        existing.openingClosingTimes.push(...openingClosingTimes);
        existing.slots.push(...slots);
      } else {
        result.push({
          day: schedule.day,
          openingClosingTimes,
          slots,
        });
      }
    }

    return result;
  }

  async getStoreAvailableDays(id: Id, isBranch = false) {
    const schedule = await this.prisma.storeSchedule.findMany({
      where: isBranch ? { branchId: id } : { Branch: { storeId: id } },
    });
    return schedule;
  }
}
