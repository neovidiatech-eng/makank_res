import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

import { LanguagesService } from 'src/_modules/languages/languages.service';
import { HelpersService } from './services/helpers.service';
@Injectable()
export class StoreRatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly languages: LanguagesService, // Assuming languages is injected or available
    private readonly helpers: HelpersService,
  ) {}
  // async create(body: CreateStoreRatingDTO) {
  //   const branch = await this.prisma.branch.findUnique({
  //     where: {
  //       id: body.branchId,
  //     },
  //   });
  //   if (!branch) throw new NotFoundException('Branch not found');
  //   await this.helpers.canUserRate(body.userId, body.orderId);

  //   const rating = calculateNewAverageRating(
  //     branch.rating,
  //     branch.review,
  //     body.rating,
  //   );

  //   await this.prisma.$transaction(async (tx) => {
  //     await tx.storeRating.create({
  //       data: {
  //         ...body,
  //       },
  //     });

  //     await tx.branch.update({
  //       where: {
  //         id: body.branchId,
  //       },
  //       data: {
  //         rating,
  //         review: {
  //           increment: 1,
  //         },
  //       },
  //     });
  //   });
  // }
  // async update(id: Id, body: UpdateStoreRatingDTO) {
  //   const oldRating = await this.helpers.getRatingById(id, body.userId);

  //   const { rating: oldAverage, review: totalReviews } = oldRating.Branch;
  //   const { rating: oldUserRating } = oldRating;
  //   const { rating: newUserRating } = body;

  //   const newAverage = calculateUpdatedAverageRating(
  //     oldAverage,
  //     totalReviews,
  //     oldUserRating,
  //     newUserRating,
  //   );
  //   await this.prisma.$transaction(async (tx) => {
  //     await tx.storeRating.update({
  //       where: { id: oldRating.id },
  //       data: { rating: newUserRating },
  //     });
  //     await tx.branch.update({
  //       where: { id: oldRating.Branch.id },
  //       data: { rating: newAverage },
  //     });
  //   });
  // }

  // async findAll(filters: FilterStoreRatingDTO) {
  //   const languages = await this.languages.getCashedLanguages();
  //   const args = getStoreRatingArgs(filters, languages);
  //   const argsWithSelect = getStoreRatingArgsWithSelect();

  //   const data = await this.prisma.storeRating[firstOrMany(filters?.id)]({
  //     ...argsWithSelect,
  //     ...args,
  //   });
  //   return data;
  // }

  // async count(filters: FilterStoreRatingDTO) {
  //   const languages = await this.languages.getCashedLanguages();
  //   const args = getStoreRatingArgs(filters, languages);
  //   const total = await this.prisma.storeRating.count({ where: args.where });

  //   return total;
  // }
  // async delete(id: Id, userId: Id) {
  //   const oldRating = await this.helpers.getRatingById(id, userId);
  //   if (!oldRating)
  //     throw new BadRequestException('Rating not found for this user');

  //   const { rating: oldAverage, review: totalReviews } = oldRating.Branch;
  //   const { rating: deletedRating } = oldRating;

  //   const newAverage = calculateDeletedAverageRating(
  //     oldAverage,
  //     totalReviews,
  //     deletedRating,
  //   );

  //   await this.prisma.$transaction(async (tx) => {
  //     await tx.storeRating.delete({ where: { id: oldRating.id } });

  //     await tx.branch.update({
  //       where: { id: oldRating.Branch.id },
  //       data: {
  //         rating: newAverage,
  //         review: { decrement: 1 },
  //       },
  //     });
  //   });
  // }
}
