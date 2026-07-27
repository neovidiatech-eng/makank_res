import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

import { firstOrMany } from 'src/globals/helpers/first-or-many';
import {
  FilterSystemNotificationDTO,
  UpdateSystemNotificationDTO,
} from './dto/system-notification.dto';
import {
  getSystemNotificationArgs,
  getSystemNotificationArgsWithSelect,
} from './prisma-args/system-notification.prisma.args';

@Injectable()
export class SystemNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async update(id: Id, body: UpdateSystemNotificationDTO) {
    await this.prisma.systemNotification.update({ where: { id }, data: body });
  }

  async findAll(filters: FilterSystemNotificationDTO) {
    const args = getSystemNotificationArgs(filters);
    const argsWithSelect = getSystemNotificationArgsWithSelect();

    const data = await this.prisma.systemNotification[firstOrMany(filters?.id)](
      {
        ...argsWithSelect,
        ...args,
      },
    );
    return data;
  }
}
