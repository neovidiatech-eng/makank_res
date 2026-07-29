import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ExistMiddleware } from 'prisma/middleware/prisma.exist.middleware';
import { softDeleteMiddleware } from 'prisma/middleware/prisma.softdelete.middleware';
import { sortMiddleware } from 'prisma/middleware/prisma.sort.middleware';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    try {
      await this.$connect();
      const prisma = new PrismaClient({
        datasources: {
          db: {
            url: env('DATABASE_URL'),
          },
        },
        log: ['query', 'error'],
      });
      this.$use(softDeleteMiddleware(prisma));
      this.$use(sortMiddleware());
      this.$use(ExistMiddleware(prisma));
    } catch (error) {
      // `catchHandler` was called here but never defined anywhere — if
      // $connect() ever actually failed, this catch block itself threw a
      // second, unrelated ReferenceError instead of reporting the real
      // connection failure.
      // eslint-disable-next-line no-console
      console.error('Error connecting to database', error);
    }
  }
}
