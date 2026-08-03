import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { calculateDeletedAverageRating } from 'src/globals/helpers/calculateAverageRating.helper';
import { PrismaService } from 'src/globals/services/prisma.service';
import { NotificationService } from 'src/globals/services/notification.service';
import { FilterRatingDTO } from '../dto/rating.dto';
import {
  getDeliveryRatingArgs,
  getDeliveryRatingArgsWithSelect,
  getStoreRatingArgs,
  getStoreRatingArgsWithSelect,
} from '../prisma-args/rating.prisma.args';

@Injectable()
export class RatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

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
    const rating = await this.prisma.storeRating.findUnique({
      where: { id },
      include: {
        store: {
          select: {
            name: true,
          },
        },
        Branch: {
          include: {
            Store: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

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

    const storeName = rating.store?.name || rating.Branch?.Store?.name;
    const storeNameAr = (storeName as any)?.ar || 'المطعم';
    const storeNameEn = (storeName as any)?.en || 'Restaurant';

    try {
      await this.notificationService.sendLocalizedNotification(
        rating.userId,
        {
          ar: `رد جديد على تقييمك من ${storeNameAr}`,
          en: `New reply to your review from ${storeNameEn}`,
        },
        {
          ar: reply,
          en: reply,
        },
      );
    } catch (err) {
      // Don't block HTTP response if notification delivery fails
    }
  }

  // Store (or admin) can delete a customer's review outright — but never
  // edit its rating/comment (see reply() above, the only mutation allowed
  // is the reply text). Keeps the branch's average rating/review count
  // consistent by reversing this rating's contribution.
  async delete(id: Id, user: CurrentUser) {
    const rating = await this.prisma.storeRating.findUnique({
      where: { id },
      include: { Branch: true },
    });
    if (!rating) throw new NotFoundException('Rating not found');

    if (
      user.Role?.roleKey !== RolesKeys.ADMIN &&
      rating.storeId !== user.storeId
    ) {
      throw new ForbiddenException('You do not have access to this rating');
    }

    const newAverage = calculateDeletedAverageRating(
      rating.Branch.rating,
      rating.Branch.review,
      rating.rating,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.storeRating.delete({ where: { id } });
      await tx.branch.update({
        where: { id: rating.branchId },
        data: { rating: newAverage, review: { decrement: 1 } },
      });
    });
  }
}
