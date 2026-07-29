import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { PrismaService } from 'src/globals/services/prisma.service';
import { FilterRatingDTO } from '../dto/rating.dto';
import {
  getDeliveryRatingArgs,
  getDeliveryRatingArgsWithSelect,
  getStoreRatingArgs,
  getStoreRatingArgsWithSelect,
} from '../prisma-args/rating.prisma.args';

@Injectable()
export class RatingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FilterRatingDTO) {
    const { id, deliveryId, branchId, storeId } = filters;

    // If ID is provided, we try to find in both and return the one that exists
    if (id) {
      const storeRating = await this.prisma.storeRating.findFirst({
        ...getStoreRatingArgsWithSelect(filters),
      });
      if (storeRating) return storeRating;

      const deliveryRating = await this.prisma.deliveryRating.findFirst({
        ...getDeliveryRatingArgsWithSelect(filters),
      });
      if (deliveryRating) return deliveryRating;

      throw new NotFoundException('Rating not found');
    }

    const fetchStoreRatings = !deliveryId;
    const fetchDeliveryRatings = !branchId && !storeId;

    let storeRatings = [];
    let deliveryRatings = [];

    if (fetchStoreRatings) {
      storeRatings = await this.prisma.storeRating.findMany({
        ...getStoreRatingArgsWithSelect(filters),
      });
    }

    if (fetchDeliveryRatings) {
      deliveryRatings = await this.prisma.deliveryRating.findMany({
        ...getDeliveryRatingArgsWithSelect(filters),
      });
    }

    return {
      storeRatings,
      deliveryRatings,
    };
  }

  async count(filters: FilterRatingDTO) {
    const { deliveryId, branchId, storeId } = filters;

    const fetchStoreRatings = !deliveryId;
    const fetchDeliveryRatings = !branchId && !storeId;

    let total = 0;

    if (fetchStoreRatings) {
      const storeCount = await this.prisma.storeRating.count({
        where: getStoreRatingArgs(filters).where,
      });
      total += storeCount;
    }

    if (fetchDeliveryRatings) {
      const deliveryCount = await this.prisma.deliveryRating.count({
        where: getDeliveryRatingArgs(filters).where,
      });
      total += deliveryCount;
    }

    return total;
  }

  async reply(id: Id, reply: string, user: CurrentUser) {
    const rating = await this.prisma.storeRating.findUnique({ where: { id } });
    if (!rating) throw new NotFoundException('Rating not found');

    if (
      user.Role?.roleKey !== RolesKeys.ADMIN &&
      rating.storeId !== user.storeId
    ) {
      throw new ForbiddenException('You do not have access to this rating');
    }

    await this.prisma.storeRating.update({
      where: { id },
      data: { reply, repliedAt: new Date() },
    });
  }
}
