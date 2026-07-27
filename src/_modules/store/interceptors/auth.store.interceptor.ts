import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { PrismaService } from 'src/globals/services/prisma.service';
import { FilterStoreDTO } from '../dto/store.dto';

@Injectable()
export class AuthStoreInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request: Request & { user: CurrentUser; query: any } = context
      .switchToHttp()
      .getRequest();

    const user = request.user;
    const filters = request.query as FilterStoreDTO;
    if (user && user?.Role?.roleKey === RolesKeys.CUSTOMER) {
      filters.customerId = +user.id;
      const address = await this.prisma.address.count({
        where: {
          userId: user.id,
          default: true,
        },
      });
      if (address === 0) {
        if (!filters?.lat || !filters?.lng) {
          throw new BadRequestException(
            'lat and lng are required for visitors and customers that not has default address to find stores',
          );
        }
        await this.prisma.address.create({
          data: {
            title: 'المنزل',
            adress: filters?.address,
            userId: +user.id,
            lat: +filters.lat,
            lng: +filters.lng,
            default: true,
          },
        });
      }
    }
    if (!user && !filters?.lat && !filters?.lng) {
      throw new BadRequestException(
        'lat and lng are required for visitors to find stores',
      );
    }

    return next.handle();
  }
}
