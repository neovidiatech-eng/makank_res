import { PrismaClient, Prisma } from '@prisma/client';

export function softDeleteMiddleware<
  T extends Prisma.BatchPayload = Prisma.BatchPayload,
>(prisma: PrismaClient): Prisma.Middleware {
  return async (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<T>,
  ): Promise<T> => {
    const includeDeleted = params.args?.__includeDeleted;
    if (params.args) {
      delete params.args.__includeDeleted;
    }
    const modelMeta = Prisma.dmmf?.datamodel?.models.find(
      (m) => m.name === params.model,
    );

    const dates = Prisma.dmmf?.datamodel?.models
      .find((m) => m.name === params.model)
      ?.fields.filter((field) => field.name.endsWith('At'));

    const modelHasDeletedAt =
      dates?.some((field) => field.name === 'deletedAt') ?? false;

    if (params.action === 'delete' && modelHasDeletedAt) {
      const uniqueFields = modelMeta.fields.filter((f) => f.isUnique);
      const record = await prisma[params.model].findUnique({
        where: params.args.where,
      });
      const data: any = {
        deletedAt: new Date(),
      };

      for (const field of uniqueFields) {
        const value = record[field.name];
        if (typeof value === 'string') {
          data[field.name] = `deleted_${value}_${record.id}`;
        }
      }
      params.action = 'update';
      params.args = { ...params?.args, data: data };
    }
    if (
      (params.action === 'findMany' ||
        params.action === 'count' ||
        params.action === 'findFirst' ||
        params.action === 'findUnique') &&
      modelHasDeletedAt &&
      !includeDeleted
    ) {
      const omittedDates = {};
      dates?.forEach((date) => {
        omittedDates[date.name] = true;
      });
      params.args = {
        ...params.args,
        where: { deletedAt: null, ...params?.args?.where },
        omit:
          params?.args?.select || params?.action === 'count'
            ? undefined
            : {
                ...omittedDates,
                ...params?.args?.omit,
              },
      };
    } else if (
      (params.action === 'aggregate' || params.action === 'groupBy') &&
      modelHasDeletedAt &&
      !includeDeleted
    ) {
      const omittedDates = {};
      dates?.forEach((date) => {
        omittedDates[date.name] = true;
      });
      params.args = {
        ...params.args,
        where: { deletedAt: null, ...params?.args?.where },
      };
    }
    const result = await next(params);
    return result;
  };
}
