import { NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export function ExistMiddleware(prisma: PrismaClient): Prisma.Middleware {
  return async (params, next) => {
    if (
      !params?.args?.select?.Sessions &&
      ['update', 'delete'].includes(params.action)
    ) {
      const modelName = params.model as keyof PrismaClient;
      const modelDelegate = prisma[modelName] as any;
      const where = params.args.where;

      // Check if where has at least one valid (non-undefined) value
      const hasValidUniqueKey = Object.values(where).some(
        (value) => value !== undefined && value !== null,
      );

      if (hasValidUniqueKey) {
        const exists = await modelDelegate.findUnique({
          where: where,
        });
        if (!exists || (exists.deletedAt && exists.deletedAt !== null)) {
          throw new NotFoundException(
            `*${Object.keys(where)[0]}* 0EXIST0`,
          );
        }
      }
    }
    return next(params);
  };
}
