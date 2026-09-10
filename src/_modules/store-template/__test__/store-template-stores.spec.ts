import { StoreTemplateService } from '../store-template.service';

describe('StoreTemplateService — section store ordering & reordering', () => {
  let service: StoreTemplateService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      storeTemplate: {
        findUnique: jest.fn(),
      },
      storeTemplateApplication: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((actions) => Promise.all(actions)),
    };

    service = new StoreTemplateService(prisma);
  });

  describe('getTemplateStores', () => {
    it('returns stores applied to template, sorted with non-zero orders first', async () => {
      prisma.storeTemplate.findUnique.mockResolvedValue({ id: 1, name: { ar: 'مطاعم' } });

      const mockApplications = [
        {
          id: 101,
          storeId: 1,
          templateId: 1,
          order: 0,
          appliedAt: new Date(),
          store: {
            id: 1,
            name: { ar: 'مطعم أ' },
            logo: '/logo1.png',
            cityId: 1,
            city: { id: 1, name: { ar: 'الرياض' } },
            branches: [{ id: 10, address: 'شارع 1', phone: '123', isActive: true, closed: false }],
          },
        },
        {
          id: 102,
          storeId: 2,
          templateId: 1,
          order: 2,
          appliedAt: new Date(),
          store: {
            id: 2,
            name: { ar: 'مطعم ب' },
            logo: '/logo2.png',
            cityId: 1,
            city: { id: 1, name: { ar: 'الرياض' } },
            branches: [{ id: 20, address: 'شارع 2', phone: '456', isActive: true, closed: false }],
          },
        },
        {
          id: 103,
          storeId: 3,
          templateId: 1,
          order: 1,
          appliedAt: new Date(),
          store: {
            id: 3,
            name: { ar: 'مطعم ج' },
            logo: '/logo3.png',
            cityId: 1,
            city: { id: 1, name: { ar: 'الرياض' } },
            branches: [{ id: 30, address: 'شارع 3', phone: '789', isActive: true, closed: false }],
          },
        },
      ];

      prisma.storeTemplateApplication.findMany.mockResolvedValue(mockApplications);

      const result = await service.getTemplateStores(1);

      // Expected sorted order: Store 3 (order 1), Store 2 (order 2), Store 1 (order 0 at end)
      expect(result.map((r) => r.storeId)).toEqual([3, 2, 1]);
      expect(result[0].order).toBe(1);
      expect(result[1].order).toBe(2);
      expect(result[2].order).toBe(0);
    });

    it('throws NotFoundException if template does not exist', async () => {
      prisma.storeTemplate.findUnique.mockResolvedValue(null);

      await expect(service.getTemplateStores(999)).rejects.toThrow('Template not found');
    });
  });

  describe('reorderTemplateStores', () => {
    it('updates orders for all provided stores in transaction', async () => {
      prisma.storeTemplate.findUnique.mockResolvedValue({ id: 1, name: { ar: 'مطاعم' } });
      prisma.storeTemplateApplication.updateMany.mockResolvedValue({ count: 1 });

      await service.reorderTemplateStores(1, {
        orders: [
          { storeId: 10, order: 1 },
          { storeId: 20, order: 2 },
        ],
      });

      expect(prisma.storeTemplateApplication.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.storeTemplateApplication.updateMany).toHaveBeenCalledWith({
        where: { templateId: 1, storeId: 10 },
        data: { order: 1 },
      });
      expect(prisma.storeTemplateApplication.updateMany).toHaveBeenCalledWith({
        where: { templateId: 1, storeId: 20 },
        data: { order: 2 },
      });
    });
  });
});
