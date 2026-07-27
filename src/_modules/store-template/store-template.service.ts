import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, Prisma, TemplateCategory } from '@prisma/client';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { filterJsonKeyWithRawSQL } from 'src/globals/helpers/prisma-filters';
import { PrismaService } from 'src/globals/services/prisma.service';
import {
  ApplyTemplateDTO,
  CreateStoreTemplateDTO,
  CreateTemplateCategoryDTO,
  FilterStoreTemplateDTO,
  FilterTemplateCategoryDTO,
  TemplateCategoryDTO,
  TemplateServiceDTO,
  UpdateStoreTemplateDTO,
  UpdateTemplateCategoryDTO,
} from './dto/store-template.dto';
import {
  getStoreTemplateArgs,
  selectStoreTemplateFullOBJ,
  selectStoreTemplateOBJ,
} from './prisma-args/store-template.prisma.args';

@Injectable()
export class StoreTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateStoreTemplateDTO) {
    const { categories, ...templateData } = data;

    if (categories !== undefined) {
      this.validateTemplateCategories(categories);
    }

    await this.prisma.storeTemplate.create({
      data: {
        ...templateData,
        ...(categories !== undefined && {
          categories: { create: this.buildCategoriesNestedCreate(categories) },
        }),
      },
    });
  }

  async update(id: Id, data: UpdateStoreTemplateDTO) {
    const { categories, ...templateData } = data;

    if (categories !== undefined) {
      this.validateTemplateCategories(categories);
    }

    await this.prisma.storeTemplate.update({
      where: { id },
      data: {
        ...templateData,
        ...(categories !== undefined && {
          // Full replace of nested categories: drop the existing ones (DB cascade
          // clears their services/sizes/addons) and recreate from the payload.
          // Cloned live data holds no FK back to the template, so replacing here
          // never touches stores the template was already applied to.
          categories: {
            deleteMany: {},
            create: this.buildCategoriesNestedCreate(categories),
          },
        }),
      },
    });
  }

  private validateTemplateCategories(categories: TemplateCategoryDTO[]) {
    for (const cat of categories) {
      for (const svc of cat.services ?? []) {
        if (!svc.sizes || svc.sizes.length === 0) {
          throw new BadRequestException(
            `Template service "${JSON.stringify(svc.name)}" must have at least one size`,
          );
        }
        if (!svc.image) {
          throw new BadRequestException(
            `Template service "${JSON.stringify(svc.name)}" must have an image`,
          );
        }
      }
    }
  }

  private buildServicesNestedCreate(services: TemplateServiceDTO[] = []) {
    return services.map((svc) => ({
      name: svc.name,
      description: svc.description,
      image: svc.image,
      durationMinutes: svc.durationMinutes,
      price: svc.price,
      priceAfterDiscount: svc.priceAfterDiscount,
      commission: svc.commission,
      available: svc.available ?? true,
      bestRated: svc.bestRated ?? false,
      mostSeller: svc.mostSeller ?? false,
      sizes: {
        create: svc.sizes.map((sz) => ({
          name: sz.name,
          price: sz.price,
          priceAfterDiscount: sz.priceAfterDiscount,
          isDefault: sz.isDefault ?? false,
        })),
      },
      addons: svc.addons?.length
        ? {
            create: svc.addons.map((ad) => ({
              name: ad.name,
              price: ad.price,
            })),
          }
        : undefined,
    }));
  }

  private buildCategoriesNestedCreate(categories: TemplateCategoryDTO[]) {
    return categories.map((cat) => ({
      name: cat.name,
      image: cat.image,
      order: cat.order ?? 0,
      services: { create: this.buildServicesNestedCreate(cat.services) },
    }));
  }

  async delete(id: Id) {
    await this.prisma.storeTemplate.delete({ where: { id } });
  }

  async findAll(filters: FilterStoreTemplateDTO) {
    const args = getStoreTemplateArgs(filters);
    return this.prisma.storeTemplate[firstOrMany(filters?.id)]({
      ...args,
      select: filters?.id
        ? selectStoreTemplateFullOBJ()
        : selectStoreTemplateOBJ(),
    });
  }

  async count(filters: FilterStoreTemplateDTO) {
    const args = getStoreTemplateArgs(filters);
    return this.prisma.storeTemplate.count({ where: args.where });
  }

  async findOne(id: Id) {
    const template = await this.prisma.storeTemplate.findUnique({
      where: { id },
      select: selectStoreTemplateFullOBJ(),
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  /**
   * Clones a template's categories into a store-scoped `Category` set and records the
   * application. Re-fetches the template inside `tx` so callers (apply-template, store
   * creation) only need to pass ids. Service/product cloning stays disabled (see
   * `23be90c`); only categories are inherited for now.
   */
  async applyTemplateWithinTx(
    tx: Prisma.TransactionClient,
    storeId: number,
    templateId: number,
  ) {
    const template = await tx.storeTemplate.findFirst({
      where: { id: templateId, active: true, deletedAt: null },
      include: {
        categories: {
          where: { deletedAt: null },
          include: {
            services: {
              where: { deletedAt: null },
              include: {
                sizes: true,
                addons: true,
              },
            },
          },
        },
      },
    });
    if (!template)
      throw new NotFoundException('Template not found or inactive');

    for (const cat of template.categories) {
      await tx.category.create({
        data: {
          name: cat.name,
          image: cat.image,
          order: cat.order,
          storeId,
          templateCategoryId: cat.id,
        },
      });
    }

    await tx.storeTemplateApplication.create({ data: { storeId, templateId } });

    // Recompute store min price. Uses updateMany (not update): when this runs as
    // part of store creation, `storeId` was just created in this same open
    // transaction, and ExistMiddleware's existence pre-check for 'update'/'delete'
    // runs on a separate, non-transactional connection that can't see it yet —
    // updateMany isn't intercepted by that check.
    const minSizePrice = await tx.serviceSize.aggregate({
      where: { Service: { storeId, deletedAt: null }, deletedAt: null },
      _min: { price: true },
    });
    await tx.store.updateMany({
      where: { id: storeId },
      data: { minServicePrice: minSizePrice._min.price ?? 0 },
    });

    return template;
  }

  async applyToStore(storeId: number, dto: ApplyTemplateDTO) {
    const { templateId } = dto;

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store not found');

    const existing = await this.prisma.storeTemplateApplication.findUnique({
      where: { storeId_templateId: { storeId, templateId } },
    });
    if (existing) {
      throw new ConflictException('Template already applied to this store');
    }

    try {
      await this.prisma.$transaction((tx) =>
        this.applyTemplateWithinTx(tx, storeId, templateId),
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Template already applied to this store');
      }
      throw e;
    }
  }

  async listTemplateCategories(filters: FilterTemplateCategoryDTO) {
    const { id, templateId, name, page, limit, isCustomStoreCategory } =
      filters ?? {};

    // Fetch active languages for JSON query
    const languages = await this.prisma.language.findMany({});

    // isCustomStoreCategory=true  → custom Category rows only (store-owned)
    // isCustomStoreCategory=false → TemplateCategory rows only
    // isCustomStoreCategory=undefined → both (default)
    const fetchTemplateCategories = isCustomStoreCategory !== true;
    const fetchCustomCategories =
      isCustomStoreCategory !== false && templateId === undefined;

    // 1. Build where conditions for TemplateCategory
    const tcWhere: Prisma.TemplateCategoryWhereInput = {
      deletedAt: null,
    };
    if (id !== undefined) {
      tcWhere.id = id;
    }
    if (templateId !== undefined) {
      tcWhere.templateId = templateId;
    }
    if (name !== undefined) {
      const nameFilter = filterJsonKeyWithRawSQL<TemplateCategory>(
        { name },
        'name',
        languages,
      );
      if (nameFilter) {
        Object.assign(tcWhere, nameFilter);
      }
    }

    // 2. Build where conditions for Category
    const cWhere: Prisma.CategoryWhereInput = {
      deletedAt: null,
      templateCategoryId: null,
      storeId: { not: null },
    };
    if (id !== undefined) {
      cWhere.id = id;
    }
    if (name !== undefined) {
      const nameFilter = filterJsonKeyWithRawSQL<Category>(
        { name },
        'name',
        languages,
      );
      if (nameFilter) {
        Object.assign(cWhere, nameFilter);
      }
    }

    // 3. Fetch template categories
    let templateCategories = [];
    if (fetchTemplateCategories) {
      templateCategories = await this.prisma.templateCategory.findMany({
        where: tcWhere,
        select: {
          id: true,
          name: true,
          image: true,
          order: true,
          templateId: true,
        },
      });
    }

    // 4. Fetch custom categories
    let customCategories = [];
    if (fetchCustomCategories) {
      customCategories = await this.prisma.category.findMany({
        where: cWhere,
        select: {
          id: true,
          name: true,
          image: true,
          order: true,
          storeId: true,
        },
      });
    }

    // 5. Map and Merge
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

    // Order the merged list
    mergedData.sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.id - b.id;
    });

    // If single ID was requested, return first element (or null if not found)
    if (id !== undefined) {
      return mergedData[0] || null;
    }

    // 6. Paginate
    const start = (page - 1) * limit;
    const paginatedData = limit
      ? mergedData.slice(start, start + limit)
      : mergedData;

    return paginatedData;
  }

  async countTemplateCategories(filters: FilterTemplateCategoryDTO) {
    const { id, templateId, name, isCustomStoreCategory } = filters ?? {};

    const languages = await this.prisma.language.findMany({});

    const fetchTemplateCategories = isCustomStoreCategory !== true;
    const fetchCustomCategories =
      isCustomStoreCategory !== false && templateId === undefined;

    const tcWhere: Prisma.TemplateCategoryWhereInput = {
      deletedAt: null,
    };
    if (id !== undefined) {
      tcWhere.id = id;
    }
    if (templateId !== undefined) {
      tcWhere.templateId = templateId;
    }
    if (name !== undefined) {
      const nameFilter = filterJsonKeyWithRawSQL<TemplateCategory>(
        { name },
        'name',
        languages,
      );
      if (nameFilter) {
        Object.assign(tcWhere, nameFilter);
      }
    }

    const cWhere: Prisma.CategoryWhereInput = {
      deletedAt: null,
      templateCategoryId: null,
      storeId: { not: null },
    };
    if (id !== undefined) {
      cWhere.id = id;
    }
    if (name !== undefined) {
      const nameFilter = filterJsonKeyWithRawSQL<Category>(
        { name },
        'name',
        languages,
      );
      if (nameFilter) {
        Object.assign(cWhere, nameFilter);
      }
    }

    let tcCount = 0;
    if (fetchTemplateCategories) {
      tcCount = await this.prisma.templateCategory.count({
        where: tcWhere,
      });
    }

    let cCount = 0;
    if (fetchCustomCategories) {
      cCount = await this.prisma.category.count({
        where: cWhere,
      });
    }

    return tcCount + cCount;
  }

  async addCategoryToTemplate(templateId: Id, dto: CreateTemplateCategoryDTO) {
    const template = await this.prisma.storeTemplate.findFirst({
      where: { id: templateId },
    });
    if (!template) throw new NotFoundException('Template not found');

    this.validateTemplateCategories([dto]);

    await this.prisma.templateCategory.create({
      data: {
        name: dto.name,
        image: dto.image,
        order: dto.order ?? 0,
        templateId,
        services: { create: this.buildServicesNestedCreate(dto.services) },
      },
    });
  }

  async updateTemplateCategory(id: Id, dto: UpdateTemplateCategoryDTO) {
    const existing = await this.prisma.templateCategory.findFirst({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Template category not found');

    const { services, ...categoryData } = dto;
    if (services !== undefined) {
      this.validateTemplateCategories([
        { ...dto, services } as TemplateCategoryDTO,
      ]);
    }

    await this.prisma.templateCategory.update({
      where: { id },
      data: {
        ...categoryData,
        ...(services !== undefined && {
          services: {
            deleteMany: {},
            create: this.buildServicesNestedCreate(services),
          },
        }),
      },
    });
  }

  async deleteTemplateCategory(id: Id) {
    const existing = await this.prisma.templateCategory.findFirst({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Template category not found');

    await this.prisma.templateCategory.delete({ where: { id } });
  }

  async getAppliedTemplates(storeId: number) {
    return this.prisma.storeTemplateApplication.findMany({
      where: { storeId },
      select: {
        id: true,
        appliedAt: true,
        template: { select: selectStoreTemplateOBJ() },
      },
    });
  }

  /**
   * Undo applyToStore() for one store only: soft-deletes the categories that were
   * cloned into this store from this template, and clears the StoreTemplateApplication
   * ledger row so the template can be re-applied here later. The template itself (and
   * whatever it's cloned into any other store) is never touched.
   */
  async removeFromStore(storeId: number, templateId: number) {
    const application = await this.prisma.storeTemplateApplication.findUnique({
      where: { storeId_templateId: { storeId, templateId } },
    });
    if (!application) {
      throw new NotFoundException('Template is not applied to this store');
    }

    const clonedCategories = await this.prisma.category.findMany({
      where: { storeId, templateCategory: { templateId } },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // One-by-one .delete() (not deleteMany) so the soft-delete middleware, which
      // only intercepts the singular 'delete' action, converts each into
      // `deletedAt: now()` instead of a real row deletion.
      for (const { id } of clonedCategories) {
        await tx.category.delete({ where: { id } });
        await tx.service.updateMany({
          where: { categoryId: id },
          data: { deletedAt: new Date() },
        });
      }
      await tx.storeTemplateApplication.delete({
        where: { id: application.id },
      });
    });
  }
}
