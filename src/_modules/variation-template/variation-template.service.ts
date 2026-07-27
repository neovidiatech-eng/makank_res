import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';
import {
  CreateVariationTemplateDTO,
  FilterVariationTemplateDTO,
} from './dto/variation-template.dto';

@Injectable()
export class VariationTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateVariationTemplateDTO) {
    const formattedValues = (data.values || []).map((val: any) => {
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          if (parsed && typeof parsed === 'object') {
            return { name: parsed };
          }
          return { name: { en: String(parsed), ar: String(parsed) } };
        } catch {
          return { name: { en: val, ar: val } };
        }
      }

      if (typeof val === 'number') {
        return { name: { en: String(val), ar: String(val) } };
      }

      if (val && typeof val === 'object') {
        if ('name' in val) {
          const nameVal = val.name;
          if (typeof nameVal === 'string') {
            try {
              const parsed = JSON.parse(nameVal);
              if (parsed && typeof parsed === 'object') {
                return { name: parsed };
              }
              return { name: { en: String(parsed), ar: String(parsed) } };
            } catch {
              return { name: { en: nameVal, ar: nameVal } };
            }
          }
          if (typeof nameVal === 'number') {
            return { name: { en: String(nameVal), ar: String(nameVal) } };
          }
          return { name: nameVal };
        }
        return { name: val };
      }

      return { name: val };
    });

    return this.prisma.variationTemplate.create({
      data: {
        name: data.name,
        values: {
          create: formattedValues,
        },
      },
    });
  }

  async findAll(filters: FilterVariationTemplateDTO) {
    return this.prisma.variationTemplate.findMany({
      include: {
        values: true,
      },
    });
  }

  async findOne(id: number) {
    return this.prisma.variationTemplate.findUnique({
      where: { id },
      include: {
        values: true,
      },
    });
  }

  async delete(id: number) {
    return this.prisma.variationTemplate.delete({
      where: { id },
    });
  }
}
