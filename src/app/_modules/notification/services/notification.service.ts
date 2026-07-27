import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';
import { CreateNotificationDTO } from '../dto/notification.create.dto';
import { FilterNotificationDTO } from '../dto/notification.dto';
import { getNotificationArgs } from '../prisma-args/notification.prisma-args';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async findNotification(filters: FilterNotificationDTO) {
    // Defense-in-depth: never run an unscoped query. If userId is missing the
    // `getNotificationArgs` where-clause collapses to `{ AND: [] }` (returns EVERY
    // user's notifications) and the mark-read `updateMany` below would drop its
    // `userId: undefined` filter and mark ALL notifications read. Bail out instead.
    if (!filters.userId) {
      return { data: [], total: 0 };
    }
    const args = getNotificationArgs(filters);
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        ...args,
      }),
      this.prisma.notification.count({ where: args.where }),
    ]);
    await this.prisma.notification.updateMany({
      where: {
        read: false,
        userId: filters.userId,
      },
      data: {
        read: true,
      },
    });
    return { data, total };
  }
  async create(data: CreateNotificationDTO) {
    await this.prisma.notification.create({
      data,
    });
  }
  async markAllAsRead(userId: Id) {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
      },
    });
  }
  async markNotificationAsRead(id: Id) {
    await this.prisma.notification.update({
      where: {
        id,
      },
      data: {
        read: true,
      },
    });
  }
}
