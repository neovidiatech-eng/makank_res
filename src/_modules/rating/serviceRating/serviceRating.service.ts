import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

import { LanguagesService } from 'src/_modules/languages/languages.service';

import { HelpersService } from './services/helpers.service';
@Injectable()
export class ServiceRatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly languages: LanguagesService, // Assuming languages is injected or available
    private readonly helpers: HelpersService,
  ) {}
  // async create(body: CreateServiceRatingDTO) {
  //   const service = await this.helpers.getServiceById(body.serviceId);
  //   await this.helpers.canUserRate(body.userId, body.orderId);
  //   const rating = calculateNewAverageRating(
  //     service.rating,
  //     service.review,
  //     body.rating,
  //   );
  //   body.rating = rating;
  //   await this.prisma.$transaction(async (tx) => {
  //     await tx.serviceRating.create({
  //       data: {
  //         ...body,
  //       },
  //     });
  //     await tx.service.update({
  //       where: {
  //         id: body.serviceId,
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
  // async update(id: Id, body: UpdateServiceRatingDTO) {
  //   const oldRating = await this.helpers.getRatingById(id, body.userId);

  //   const { rating: oldAverage, review: totalReviews } = oldRating.Service;
  //   const { rating: oldUserRating } = oldRating;
  //   const { rating: newUserRating } = body;

  //   const newAverage = calculateUpdatedAverageRating(
  //     oldAverage,
  //     totalReviews,
  //     oldUserRating,
  //     newUserRating,
  //   );
  //   await this.prisma.$transaction(async (tx) => {
  //     (await tx.serviceRating.update({
  //       where: { id: oldRating.id },
  //       data: { rating: newUserRating },
  //     }),
  //       await tx.service.update({
  //         where: { id },
  //         data: { rating: newAverage },
  //       }));
  //   });
  // }

  // async findAll(filters: FilterServiceRatingDTO) {
  //   const languages = await this.languages.getCashedLanguages();
  //   const args = getServiceRatingArgs(filters, languages);
  //   const argsWithSelect = getServiceRatingArgsWithSelect();

  //   const data = await this.prisma.serviceRating[firstOrMany(filters?.id)]({
  //     ...argsWithSelect,
  //     ...args,
  //   });
  //   return data;
  // }

  // async count(filters: FilterServiceRatingDTO) {
  //   const languages = await this.languages.getCashedLanguages();
  //   const args = getServiceRatingArgs(filters, languages);
  //   const total = await this.prisma.serviceRating.count({ where: args.where });

  //   return total;
  // }
  // async delete(id: Id, userId: Id) {
  //   const oldRating = await this.helpers.getRatingById(id, userId);
  //   if (!oldRating)
  //     throw new BadRequestException('Rating not found for this user');

  //   const { rating: oldAverage, review: totalReviews } = oldRating.Service;
  //   const { rating: deletedRating } = oldRating;

  //   const newAverage = calculateDeletedAverageRating(
  //     oldAverage,
  //     totalReviews,
  //     deletedRating,
  //   );

  //   await this.prisma.$transaction(async (tx) => {
  //     await tx.serviceRating.delete({ where: { id: oldRating.id } });

  //     await tx.service.update({
  //       where: { id },
  //       data: {
  //         rating: newAverage,
  //         review: { decrement: 1 },
  //       },
  //     });
  //   });
  // }
}
