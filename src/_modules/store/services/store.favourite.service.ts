import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';
@Injectable()
export class StoreFavouriteService {
  constructor(private readonly prisma: PrismaService) {}

  async update(branchId: Id, customerId: Id) {
    console.log(branchId, customerId);
    const isFound = await this.prisma.favoriteStore.findUnique({
      where: {
        branchId_customerId: {
          branchId,
          customerId,
        },
      },
    });
    if (isFound) {
      await this.prisma.favoriteStore.delete({
        where: {
          branchId_customerId: {
            branchId,
            customerId,
          },
        },
      });
    } else {
      await this.prisma.favoriteStore.create({
        data: {
          branchId,
          customerId,
        },
      });
    }
  }
}
