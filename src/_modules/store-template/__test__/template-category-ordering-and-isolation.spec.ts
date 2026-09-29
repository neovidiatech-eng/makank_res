import { StoreTemplateService } from '../store-template.service';
import { getStoreArgs } from '../../store/prisma-args/store.prisma.args';

describe('Template Category Ordering & Strict Isolation Automated Tests', () => {
  let service: StoreTemplateService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      storeTemplate: {
        findUnique: jest.fn(),
      },
      templateCategory: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      language: {
        findMany: jest.fn().mockResolvedValue([{ code: 'ar' }, { code: 'en' }]),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      templateCategoryStore: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      storeTemplateApplication: {
        upsert: jest.fn(),
      },
      $transaction: jest.fn((actions) => Promise.all(actions)),
    };

    service = new StoreTemplateService(prisma);
  });

  describe('1. reorderTemplateCategories', () => {
    it('updates order for all categories in a single transaction', async () => {
      prisma.storeTemplate.findUnique.mockResolvedValue({ id: 5, name: { ar: 'قسم المشويات' } });
      prisma.templateCategory.updateMany.mockResolvedValue({ count: 1 });

      await service.reorderTemplateCategories(5, {
        orders: [
          { categoryId: 101, order: 1 },
          { categoryId: 102, order: 2 },
          { categoryId: 103, order: 3 },
        ],
      });

      expect(prisma.storeTemplate.findUnique).toHaveBeenCalledWith({ where: { id: 5 } });
      expect(prisma.templateCategory.updateMany).toHaveBeenCalledTimes(3);
      expect(prisma.templateCategory.updateMany).toHaveBeenCalledWith({
        where: { id: 101, templateId: 5 },
        data: { order: 1 },
      });
      expect(prisma.templateCategory.updateMany).toHaveBeenCalledWith({
        where: { id: 102, templateId: 5 },
        data: { order: 2 },
      });
      expect(prisma.templateCategory.updateMany).toHaveBeenCalledWith({
        where: { id: 103, templateId: 5 },
        data: { order: 3 },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('throws NotFoundException if template does not exist', async () => {
      prisma.storeTemplate.findUnique.mockResolvedValue(null);

      await expect(
        service.reorderTemplateCategories(999, {
          orders: [{ categoryId: 1, order: 1 }],
        }),
      ).rejects.toThrow('Template not found');
    });
  });

  describe('2. listTemplateCategories sorting', () => {
    it('sorts categories: order > 0 first ascending (1, 2, 3...), order === 0 at end', async () => {
      const mockCategories = [
        { id: 1, name: { ar: 'فئة غير مرتبة أ' }, order: 0, templateId: 1 },
        { id: 2, name: { ar: 'فئة ثانية' }, order: 2, templateId: 1 },
        { id: 3, name: { ar: 'فئة أولى' }, order: 1, templateId: 1 },
        { id: 4, name: { ar: 'فئة غير مرتبة ب' }, order: 0, templateId: 1 },
        { id: 5, name: { ar: 'فئة ثالثة' }, order: 3, templateId: 1 },
      ];

      prisma.templateCategory.findMany.mockResolvedValue(mockCategories);

      const result = await service.listTemplateCategories({ templateId: 1 });

      // Expected sorted order: Category 3 (order 1), Category 2 (order 2), Category 5 (order 3), Category 1 (order 0, id 1), Category 4 (order 0, id 4)
      expect(result.map((c) => c.id)).toEqual([3, 2, 5, 1, 4]);
      expect(result[0].order).toBe(1);
      expect(result[1].order).toBe(2);
      expect(result[2].order).toBe(3);
      expect(result[3].order).toBe(0);
      expect(result[4].order).toBe(0);
    });
  });

  describe('3. getTemplateCategoryStores sorting', () => {
    it('sorts stores in category: order > 0 first ascending, order === 0 at end', async () => {
      prisma.templateCategory.findUnique.mockResolvedValue({ id: 10, name: { ar: 'برجر' } });

      const mockCategoryStores = [
        {
          id: 1,
          storeId: 100,
          templateCategoryId: 10,
          order: 0,
          createdAt: new Date(),
          store: {
            id: 100,
            name: { ar: 'مطعم غير مرتب' },
            branches: [{ id: 1, address: 'شارع', isActive: true, closed: false }],
          },
        },
        {
          id: 2,
          storeId: 200,
          templateCategoryId: 10,
          order: 2,
          createdAt: new Date(),
          store: {
            id: 200,
            name: { ar: 'مطعم رقم 2' },
            branches: [{ id: 2, address: 'شارع', isActive: true, closed: false }],
          },
        },
        {
          id: 3,
          storeId: 300,
          templateCategoryId: 10,
          order: 1,
          createdAt: new Date(),
          store: {
            id: 300,
            name: { ar: 'مطعم رقم 1' },
            branches: [{ id: 3, address: 'شارع', isActive: true, closed: false }],
          },
        },
      ];

      prisma.templateCategoryStore.findMany.mockResolvedValue(mockCategoryStores);

      const result = await service.getTemplateCategoryStores(10);

      // Expected: Store 300 (order 1), Store 200 (order 2), Store 100 (order 0)
      expect(result.map((r) => r.storeId)).toEqual([300, 200, 100]);
      expect(result[0].order).toBe(1);
      expect(result[1].order).toBe(2);
      expect(result[2].order).toBe(0);
    });
  });

  describe('4. Strict TemplateCategoryStores isolation in query builder (no phantom leak)', () => {
    const mockLanguages = [
      { code: 'ar', key: 'ar' },
      { code: 'en', key: 'en' },
    ];

    it('generates strictly TemplateCategoryStores filter and NEVER queries SubCategories for templateCategoryId', () => {
      const filter: any = {
        templateCategoryId: 42,
      };

      const args = getStoreArgs(filter, mockLanguages as any, [], false, true, false, null);
      const whereStr = JSON.stringify(args.where);

      // Must strictly filter by TemplateCategoryStores
      expect(whereStr).toContain('"TemplateCategoryStores"');
      expect(whereStr).toContain('"templateCategoryId":42');

      // Must NEVER contain SubCategories for templateCategoryId
      expect(whereStr).not.toContain('"SubCategories"');
    });

    it('only uses SubCategories when categoryId (menu category) is explicitly passed', () => {
      const filterWithMenuCategory: any = {
        categoryId: 99,
      };

      const args = getStoreArgs(filterWithMenuCategory, mockLanguages as any, [], false, true, false, null);
      const whereStr = JSON.stringify(args.where);

      expect(whereStr).toContain('"SubCategories"');
      expect(whereStr).toContain('"id":99');
    });
  });
});
