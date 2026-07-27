// Store-scoped custom categories are attached by @AttachStoreId on the
// controller and persisted by the service.
import { CategoryService } from '../category.service';
import { getCategoryArgs } from '../prisma-args/category.prisma.args';

const buildPrisma = () => ({
  category: { create: jest.fn() },
  store: { findUnique: jest.fn().mockResolvedValue({ isStoreAccepted: true }) },
});

const buildService = (prisma: ReturnType<typeof buildPrisma>) =>
  new CategoryService(prisma as any, { getCashedLanguages: jest.fn() } as any);

describe('CategoryService.create - store-scoped custom categories', () => {
  it('persists the attached storeId', async () => {
    const prisma = buildPrisma();
    await buildService(prisma).create({
      name: { en: 'Snacks' },
      image: 'x.png',
      order: 1,
      storeId: 42,
    } as any);

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: {
        name: { en: 'Snacks' },
        image: 'x.png',
        order: 1,
        storeId: 42,
      },
    });
  });
});

describe('getCategoryArgs - storeId filtering', () => {
  it('filters directly by storeId', () => {
    const args: any = getCategoryArgs({ storeId: 14 } as any, []);
    expect(args.where.AND).toEqual([{ storeId: 14 }]);
  });
});
