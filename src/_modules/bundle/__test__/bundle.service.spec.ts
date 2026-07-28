import { BundleService } from '../bundle.service';

describe('BundleService ownership-scoped CRUD', () => {
  const bundleInput: any = {
    title: { en: 'Pizza offer', ar: 'عرض بيتزا' },
    description: { en: 'Buy two', ar: 'اشتري اثنين' },
    image: 'bundle.png',
    storeId: 1,
    requiredPaidQuantity: 2,
    freeQuantity: 1,
    paidServiceIds: [10],
    freeServiceIds: [20],
  };

  const buildService = (serviceCount = 2) => {
    const prisma = {
      service: { count: jest.fn().mockResolvedValue(serviceCount) },
      store: {
        findUnique: jest.fn().mockResolvedValue({ isStoreAccepted: true }),
      },
      bundle: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 1, storeId: 1 }),
        update: jest.fn().mockResolvedValue({ id: 1 }),
        delete: jest.fn().mockResolvedValue({ id: 1 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) =>
          callback({ bundle: { update: jest.fn() } }),
        ),
    };
    return { service: new BundleService(prisma as any), prisma };
  };

  it('creates scopes only when every scoped resource belongs to the bundle store', async () => {
    const { service, prisma } = buildService();
    await service.create(bundleInput);
    expect(prisma.bundle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ Store: { connect: { id: 1 } } }),
      }),
    );
  });

  it('rejects cross-store scoped services before creating a bundle', async () => {
    const { service, prisma } = buildService(1);
    await expect(service.create(bundleInput)).rejects.toThrow(
      'Every scoped service',
    );
    expect(prisma.bundle.create).not.toHaveBeenCalled();
  });

  it('requires a complete replacement when scopes are updated', async () => {
    const { service, prisma } = buildService();
    await expect(service.update(1, { paidServiceIds: [10] })).rejects.toThrow(
      'Scope updates must include',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows a partial rule update when the dependent field already exists on the stored bundle', async () => {
    const { service, prisma } = buildService();
    prisma.bundle.findUnique.mockResolvedValue({
      id: 1,
      storeId: 1,
      paidRequiredSizeName: 'medium',
    });
    await expect(
      service.update(1, { paidSizeRule: 'NAME' as any }),
    ).resolves.toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('still rejects a partial rule update when the dependent field is missing everywhere', async () => {
    const { service, prisma } = buildService();
    prisma.bundle.findUnique.mockResolvedValue({
      id: 1,
      storeId: 1,
      paidRequiredSizeName: null,
    });
    await expect(
      service.update(1, { paidSizeRule: 'NAME' as any }),
    ).rejects.toThrow('paidRequiredSizeName is required');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
