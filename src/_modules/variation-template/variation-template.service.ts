import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
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
        storeId: data.storeId ?? null,
        values: {
          create: formattedValues,
        },
      },
    });
  }

  // A Store-role caller sees every global (storeId: null) preset plus their
  // own — never another store's. Admin/visitor see everything, or one
  // store's if ?storeId= is explicitly given.
  async findAll(filters: FilterVariationTemplateDTO, user?: CurrentUser) {
    const isStore = user?.Role?.roleKey === RolesKeys.STORE;
    return this.prisma.variationTemplate.findMany({
      where: isStore
        ? { OR: [{ storeId: null }, { storeId: user.storeId }] }
        : filters.storeId
          ? { storeId: filters.storeId }
          : undefined,
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

  // Never lets a store delete a global (admin-defined) preset or another
  // store's — only its own.
  async delete(id: number, user: CurrentUser) {
    const template = await this.prisma.variationTemplate.findUnique({
      where: { id },
      select: { storeId: true },
    });
    if (!template) throw new NotFoundException('Variation template not found');

    if (
      user.Role?.roleKey !== RolesKeys.ADMIN &&
      template.storeId !== user.storeId
    ) {
      throw new ForbiddenException(
        'You do not have access to this variation template',
      );
    }

    return this.prisma.variationTemplate.delete({
      where: { id },
    });
  }
}
