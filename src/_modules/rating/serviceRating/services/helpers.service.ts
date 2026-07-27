import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

import { LanguagesService } from 'src/_modules/languages/languages.service';
@Injectable()
export class HelpersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly languages: LanguagesService, // Assuming languages is injected or available
  ) {}
  async getServiceById(id: Id) {
    const service = await this.prisma.service.findUnique({
      where: {
        id,
      },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }
  // async canUserRate(userId: Id, orderId: Id) {
  //   const isUserRated = await this.prisma.serviceRating.findUnique({
  //     where: {
  //       orderId_userId: {
  //         orderId,
  //         userId,
  //       },
  //     },
  //   });
  //   if (isUserRated)
  //     throw new BadRequestException('You have already rated this service');
  //   const order = await this.prisma.order.findUnique({
  //     where:{
  //       id:orderId
  //     }
  //   })
  //   if (!order)
  //     throw new BadRequestException('You have not ordered this service');
  //   const completedStatus = order.status === OrderStatus.COMPLETED;
  //   if (!completedStatus)
  //     throw new BadRequestException(
  //       'Your Order to this service is not completed',
  //     );
  // }
  // async getRatingById(id: Id, userId: Id) {
  //   const rating = await this.prisma.serviceRating.findUnique({
  //     where: {
  //       id,
  //     },
  //     select:{
  //       id:true,
  //       rating:true,
  //       userId:true,
  //       Service:{
  //         select:{
  //           rating:true,
  //           review:true
  //         }
  //       }
  //     }
  //   });
  //   if(!rating) throw new NotFoundException('Rating not found');
  //   if(rating.userId!==userId) throw new BadRequestException('You can`t access this rating');
  //   return rating;
  // }
}
