import { Injectable } from '@nestjs/common';
import { isArray } from 'class-validator';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import { UpdateCustomerDTO } from '../dto/create.customer.dto';
import { FilterCustomerDTO } from '../dto/filter.customer.dto';
import { getCustomerArgs } from '../prisma-args/customer.prisma-args';

export type CustomerStats = {
  id: number;
  email: string;
  name: string;
  phone: string;
  verified: boolean;
  active: boolean;
  image: string;
  Details: {
    wallet: number;
    points: number;
    male: boolean;
  };
  createdAt: Date;
  deletedAt: Date;
  totalOrders: number;
  totalSpent: number;
};
@Injectable()
export class CustomerService {
  constructor(private prisma: PrismaService) {}

  async getAll(filters: FilterCustomerDTO) {
    const args = getCustomerArgs(filters);
    const users = await this.prisma.user[firstOrMany(filters?.id)](args);
    const formatedUsers =
      users && (await this.statistics(isArray(users) ? users : [users]));
    return isArray(users)
      ? formatedUsers
      : formatedUsers
        ? formatedUsers?.at(0)
        : null;
  }
  async delete(id: Id) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    await this.prisma.user.update({
      where: { id },
      data: {
        phone: user.phone ? `deleted-${user.phone}-${id}` : null,
        email: `deleted-${user.email}-${id}`,
      },
    });
    await this.prisma.user.delete({ where: { id } });
  }

  async update(id: Id, data: UpdateCustomerDTO) {
    await this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async count(filters: FilterCustomerDTO) {
    const args = getCustomerArgs(filters);
    return this.prisma.user.count({ where: args.where });
  }

  private async statistics(users: any): Promise<CustomerStats[]> {
    const userIds = users.map((u: any) => u.id);
    if (!userIds || userIds.length === 0) return [];

    const stats = await this.prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _count: { _all: true },
      _sum: { totalPriceAfterDiscount: true },
    });

    const enrichedUsers: CustomerStats[] = users.map((u: any) => {
      const stat = stats.find((s: any) => s.userId === u.id);

      return {
        ...u,
        totalOrders: stat?._count._all ?? 0,
        totalSpent: stat?._sum.totalPriceAfterDiscount ?? 0,
      };
    });

    return enrichedUsers;
  }
}
