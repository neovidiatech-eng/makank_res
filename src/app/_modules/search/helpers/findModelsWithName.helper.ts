import { Prisma } from '@prisma/client';

export function findModelsWithNameAndStringOrJsonFields() {
  const models = Prisma.dmmf.datamodel.models;

  const result = models
    .filter((model) => model.fields.some((field) => field.name === 'name'))
    .map((model) => {
      const stringOrJsonFields = model.fields
        .filter(
          (field) =>
            (field.type === 'String' || field.type === 'Json') &&
            field.name !== 'password',
        )
        .map((field) => ({
          name: field.name,
          type: field.type,
        }));

      return {
        model: model.name,
        fields: stringOrJsonFields,
      };
    });

  return result;
}
export function getFieldType(
  modelName: string,
  fieldName: string,
): string | null {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
  if (!model) return null;

  const field = model.fields.find((f) => f.name === fieldName);
  if (!field) return null;

  return field.type;
}
