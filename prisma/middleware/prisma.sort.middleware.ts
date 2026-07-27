import { Prisma } from '@prisma/client';

export function sortMiddleware<
  T extends Prisma.BatchPayload = Prisma.BatchPayload,
>(): Prisma.Middleware {
  return async (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<T>,
  ): Promise<T> => {
    // Get all date fields from the model
    const dateFields = Prisma.dmmf?.datamodel?.models
      ?.find((m) => m?.name === params?.model)
      ?.fields?.filter((field) => Boolean(field?.name?.endsWith('At')));

    // Check if model has createdAt field
    const modelHasCreatedAt =
      dateFields?.some((field) => field?.name === 'createdAt') ?? false;

    // Apply to findMany actions when createdAt exists
    if (params.action === 'findMany' && modelHasCreatedAt) {
      const existingOrderBy = params.args?.orderBy;
      let newOrderBy;

      if (!existingOrderBy) {
        newOrderBy = { createdAt: 'desc' };
      } else if (Array.isArray(existingOrderBy)) {
        // Check if createdAt is already in the orderBy
        const hasCreatedAtOrder = existingOrderBy.some(
          (order) => order?.createdAt !== undefined,
        );
        if (!hasCreatedAtOrder) {
          newOrderBy = [...existingOrderBy, { createdAt: 'desc' }];
        } else {
          newOrderBy = existingOrderBy;
        }
      } else {
        // If orderBy is an object but not an array
        if (!existingOrderBy?.createdAt) {
          newOrderBy = [existingOrderBy, { createdAt: 'desc' }];
        } else {
          newOrderBy = existingOrderBy;
        }
      }

      // Update the params with the new orderBy
      params.args = {
        ...params.args,
        orderBy: newOrderBy,
      };
    }

    return next(params);
  };
}
