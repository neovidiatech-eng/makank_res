import { Injectable } from '@nestjs/common';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { PrismaService } from 'src/globals/services/prisma.service';
import { FilterSearchDTO } from '../dto/search.dto';
import {
  findModelsWithNameAndStringOrJsonFields,
  getFieldType,
} from '../helpers/findModelsWithName.helper';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  getAllowedModels() {
    const data = findModelsWithNameAndStringOrJsonFields();
    return data;
  }

  async search(dto: FilterSearchDTO) {
    const { models } = dto;
    const data = [];
    for (const modelDto of models) {
      const { model, fields, value, page, limit } = modelDto;

      const { modelData, total } = await this.searchModel(
        model,
        fields,
        value,
        page,
        limit,
      );
      data.push({
        model,
        data: modelData || [],
        total: total || 0,
      });
    }

    return data;
  }

  private async searchModel(
    model: string,
    fields: string[],
    value: string,
    page: number,
    limit: number,
  ) {
    const fieldsType = [];
    for (const field of fields) {
      const type = getFieldType(model, field);
      fieldsType.push({ field, type });
    }
    const fieldsFilter = [];
    for (const { field, type } of fieldsType) {
      const filters = await this.searchField(field, type, value);
      fieldsFilter.push(...filters);
    }
    let omit = {};
    if (model === 'User') {
      omit = { password: true };
    }
    const pagination = paginateOrNot({ limit, page }, false);

    if (model === 'TemplateCategory') {
      const templateCategories = await this.prisma.templateCategory.findMany({
        where: {
          OR: fieldsFilter,
        },
      });

      const categoryFieldsType = [];
      for (const field of fields) {
        const type = getFieldType('Category', field);
        categoryFieldsType.push({ field, type });
      }
      const categoryFieldsFilter = [];
      for (const { field, type } of categoryFieldsType) {
        const filters = await this.searchField(field, type, value);
        categoryFieldsFilter.push(...filters);
      }

      const customCategories = await this.prisma.category.findMany({
        where: {
          templateCategoryId: null,
          storeId: { not: null },
          OR: categoryFieldsFilter,
        },
      });

      const mergedData = [
        ...templateCategories.map((tc) => ({
          ...tc,
          isCustomStoreCategory: false,
          storeId: null,
        })),
        ...customCategories.map((c) => ({
          id: c.id,
          name: c.name,
          image: c.image,
          order: c.order,
          templateId: null,
          storeId: c.storeId,
          isCustomStoreCategory: true,
        })),
      ];

      const total = mergedData.length;
      const start = (page - 1) * limit;
      const paginatedData = limit
        ? mergedData.slice(start, start + limit)
        : mergedData;

      return {
        modelData: paginatedData,
        total,
      };
    }

    const data = await this.prisma[model].findMany({
      where: {
        OR: fieldsFilter,
      },
      ...pagination,
      omit,
    });

    const total = await this.prisma[model].count({
      where: {
        OR: fieldsFilter,
      },
    });
    return {
      modelData: data,
      total,
    };
  }
  private async searchField(field: string, type: string, value: string) {
    if (type === 'String') {
      const filters = {
        [field]: {
          contains: value,
        },
      };
      return [filters];
    } else if (type === 'Json') {
      const languages = await this.prisma.language.findMany({});
      const filters = languages.map((lang) => ({
        [field]: {
          path: `$.${lang.key}`,
          string_contains: value,
        },
      }));
      return filters;
    }
    return [];
  }
}
