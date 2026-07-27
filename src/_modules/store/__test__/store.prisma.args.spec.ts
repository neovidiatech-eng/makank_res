import { selectStoreOBJ } from '../prisma-args/store.prisma.args';

describe('selectStoreOBJ bundle inclusion', () => {
  it('omits bundles from the store listing select by default', () => {
    expect(selectStoreOBJ()).not.toHaveProperty('Bundles');
  });

  it('embeds only active bundles in the store detail select', () => {
    const select = selectStoreOBJ(true) as any;
    expect(select.Bundles).toBeDefined();
    expect(select.Bundles.where).toBeDefined();
    expect(select.Bundles.select).toBeDefined();
  });
});
