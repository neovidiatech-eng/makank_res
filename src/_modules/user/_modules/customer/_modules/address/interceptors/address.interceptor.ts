import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class AddressInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request: Request & { user: CurrentUser; query: any } = context
      .switchToHttp()
      .getRequest();
    const userId = request.user?.id;
    if (request.method === 'GET') {
      request.query.userId = userId;
    } else if (request.method === 'POST') {
      request.body.userId = userId;
    } else if (request.method === 'PATCH' || request.method === 'DELETE') {
      request.body.userId = userId;
      const id = +request.params.id || +request.query.id;
      const isFound = await this.prisma.address.findUnique({
        where: {
          id,
        },
      });
      if (isFound.userId !== userId) {
        throw new ForbiddenException(
          'You are not allowed to take any action in this address',
        );
      }
    }

    return next.handle();
  }
}
