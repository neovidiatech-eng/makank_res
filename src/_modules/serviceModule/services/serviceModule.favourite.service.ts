import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';
@Injectable()
export class ServiceModuleFavouriteService {
  constructor(private readonly prisma: PrismaService) {}

  async update(serviceId: Id, customerId: Id) {
    const isFound = await this.prisma.favoriteService.findUnique({
      where: {
        serviceId_customerId: {
          serviceId,
          customerId,
        },
      },
    });
    if (isFound) {
      await this.prisma.favoriteService.delete({
        where: {
          serviceId_customerId: {
            serviceId,
            customerId,
          },
        },
      });
    } else {
      await this.prisma.favoriteService.create({
        data: {
          serviceId,
          customerId,
        },
      });
    }
  }
}
