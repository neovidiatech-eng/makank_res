import { seedStoreTemplates } from '../store-template.seed';

const buildPrisma = () => ({
  storeTemplate: {
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({}),
  },
});

describe('seedStoreTemplates - module-free templates', () => {
  it('persists string moduleType values without moduleId', async () => {
    const prisma = buildPrisma();

    await seedStoreTemplates(prisma as any);

    const calls = (prisma.storeTemplate.create as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [{ data }] of calls) {
      expect(typeof data.moduleType).toBe('string');
      expect(data.moduleId).toBeUndefined();
    }
  });

  it('skips seeding entirely when templates already exist', async () => {
    const prisma = buildPrisma();
    (prisma.storeTemplate.count as jest.Mock).mockResolvedValue(5);

    await seedStoreTemplates(prisma as any);

    expect(prisma.storeTemplate.create).not.toHaveBeenCalled();
  });
});
