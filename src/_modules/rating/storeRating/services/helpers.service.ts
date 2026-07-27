import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

import { OrderStatus } from '@prisma/client';
import { LanguagesService } from 'src/_modules/languages/languages.service';
@Injectable()
export class HelpersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly languages: LanguagesService, // Assuming languages is injected or available
  ) {}
  async getBranchById(id: Id) {
    const branch = await this.prisma.branch.findUnique({
      where: {
        id,
      },
    });
    if (!branch) throw new NotFoundException('branch not found');
    return branch;
  }
  async canUserRate(userId: Id, orderId: Id) {
    const isUserRated = await this.prisma.storeRating.findUnique({
      where: {
        orderId_userId: {
          orderId,
          userId,
        },
      },
    });
    if (isUserRated)
      throw new BadRequestException('You have already rated this service');
    const order = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },
      select: {
        status: true,
      },
    });
    if (!order)
      throw new BadRequestException('You have not ordered this service');
    const completedStatus = order.status === OrderStatus.DELIVERED;
    if (!completedStatus)
      throw new BadRequestException(
        'Your Order to this service is not completed',
      );
  }
  async getRatingById(id: Id, userId: Id) {
    const rating = await this.prisma.storeRating.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        rating: true,
        userId: true,
        Branch: {
          select: {
            id: true,
            rating: true,
            review: true,
          },
        },
      },
    });
    if (!rating) throw new NotFoundException('Rating not found');
    if (rating.userId !== userId)
      throw new BadRequestException('You can`t access this rating');
    return rating;
  }
}
