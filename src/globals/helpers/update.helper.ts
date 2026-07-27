import { PrismaClient } from '@prisma/client';

interface DynamicUpdateOptions {
  table: keyof PrismaClient; // Only allow valid model names
  id: number;
  body: Record<string, any>;
  relations?: {
    key: string;
    table: keyof PrismaClient; // Only valid model names
    foreignKey: string;
    relationalKey: string;
  }[];
  isDryRun?: boolean;
}

export async function DynamicRelationUpdate(
  prisma: PrismaClient,
  options: DynamicUpdateOptions,
) {
  const { table, id, body, relations = [], isDryRun = true } = options;

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Filter out relation fields
      const relationKeys = relations.map((r) => r.key);
      const directFields = Object.fromEntries(
        Object.entries(body).filter(([key]) => !relationKeys.includes(key)),
      );

      // 2. Type-safe main record update
      const updatedRecord = await (tx[table] as any).update({
        where: { id },
        data: directFields,
      });

      // 3. Process relations with runtime validation
      for (const relation of relations) {
        if (body[relation.key] !== undefined) {
          const junctionModel = tx[relation.table] as any;

          await junctionModel.deleteMany({
            where: { [relation.foreignKey]: id },
          });

          if (Array.isArray(body[relation.key])) {
            await junctionModel.createMany({
              data: body[relation.key].map((val: any) => ({
                [relation.foreignKey]: id,
                [relation.relationalKey]: val,
              })),
            });
          }
        }
      }

      if (isDryRun) {
        throw new Error('DRY_RUN_COMPLETE');
      }

      return updatedRecord;
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DRY_RUN_COMPLETE') {
      return { dryRun: true, wouldUpdate: { table, id, changes: body } };
    }
    throw error;
  }
}
